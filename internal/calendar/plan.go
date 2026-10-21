// Package calendar normalizes shift plans and renders RFC 5545 calendars.
package calendar

import (
	"encoding/json"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const (
	DefaultDurationMonths = 12
	MaxDurationMonths     = 24
	DefaultBackwardMonths = 3
	MaxBackwardMonths     = 24
	MaxShiftPresets       = 12
	MaxEndDayOffset       = 7
	MaxShiftNoteLength    = 500
)

var (
	usernamePattern   = regexp.MustCompile(`^[\p{L}\p{N}_-]+$`)
	inviteCodePattern = regexp.MustCompile(`^[\p{L}\p{N}_-]{4,32}$`)
	presetIDPattern   = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
	clockPattern      = regexp.MustCompile(`^([01][0-9]|2[0-3]):[0-5][0-9]$`)
)

// ValidationError is a user-correctable input error with a stable API code.
type ValidationError struct {
	Status int
	Code   string
}

func (e *ValidationError) Error() string { return e.Code }

func invalid(code string) error {
	return &ValidationError{Status: 400, Code: code}
}

// Shift is one day in a repeating shift cycle.
type Shift struct {
	Kind         string  `json:"kind"`
	Name         string  `json:"name"`
	Start        string  `json:"start"`
	End          string  `json:"end"`
	EndDayOffset int     `json:"endDayOffset"`
	Tone         string  `json:"tone"`
	PresetID     *string `json:"presetId"`
	Note         string  `json:"note,omitempty"`
}

// Plan is the normalized representation stored for a member calendar.
type Plan struct {
	Title          string  `json:"title"`
	Timezone       string  `json:"timezone"`
	DurationMonths int     `json:"durationMonths"`
	BackwardCycle  bool    `json:"backwardCycle"`
	BackwardMonths int     `json:"backwardMonths"`
	TodayIndex     int     `json:"todayIndex"`
	IncludeRest    bool    `json:"includeRest"`
	Cycle          []Shift `json:"cycle"`
}

// ShiftPreset is a reusable, member-owned shift definition.
type ShiftPreset struct {
	ID            string `json:"id"`
	Kind          string `json:"kind"`
	Name          string `json:"name"`
	Start         string `json:"start"`
	End           string `json:"end"`
	EndDayOffset  int    `json:"endDayOffset"`
	Tone          string `json:"tone"`
	VisibleOnHome bool   `json:"visibleOnHome"`
	Removable     bool   `json:"removable"`
}

// Tones maps stable color names to calendar event colors.
var Tones = map[string]string{
	"sky":     "#2f7fda",
	"indigo":  "#5665df",
	"violet":  "#7654d6",
	"plum":    "#8e5bc0",
	"fuchsia": "#bc3fa4",
	"rose":    "#d74481",
	"berry":   "#a94774",
	"red":     "#ca3d4c",
	"orange":  "#dd5f26",
	"coral":   "#df7059",
	"clay":    "#ad6044",
	"amber":   "#bd8212",
	"sun":     "#cfa11d",
	"lime":    "#789e24",
	"sage":    "#3d8c63",
	"emerald": "#178b65",
	"teal":    "#148680",
	"slate":   "#536b87",
}

// NormalizePlan validates compact or expanded plan JSON and fills every
// optional field with the same defaults as the previous API.
func NormalizePlan(raw any, defaultTimezone string) (Plan, error) {
	object, ok := raw.(map[string]any)
	if !ok {
		return Plan{}, invalid("invalid_plan")
	}

	sourceCycle, ok := asSlice(firstValue(object, "c", "cycle"))
	if !ok || len(sourceCycle) == 0 {
		return Plan{}, invalid("invalid_cycle")
	}

	cycle := make([]Shift, 0, len(sourceCycle))
	for index, source := range sourceCycle {
		shift, err := normalizeShift(source, index)
		if err != nil {
			return Plan{}, err
		}
		cycle = append(cycle, shift)
	}

	todayIndex := intValue(firstValue(object, "i", "todayIndex"), 0)
	if todayIndex < 0 || todayIndex >= len(cycle) {
		todayIndex = 0
	}

	duration := intValue(firstValue(object, "d", "durationMonths"), DefaultDurationMonths)
	duration = clamp(duration, 1, MaxDurationMonths)

	backwardMonths := intValue(firstValue(object, "bm", "backwardMonths"), DefaultBackwardMonths)
	backwardMonths = clamp(backwardMonths, 1, MaxBackwardMonths)

	return Plan{
		Title:          cleanText(firstValue(object, "t", "title"), 64, "轮转班表"),
		Timezone:       NormalizeTimezone(textValue(firstValue(object, "z", "timezone")), defaultTimezone),
		DurationMonths: duration,
		BackwardCycle:  boolValue(firstValue(object, "b", "backwardCycle")),
		BackwardMonths: backwardMonths,
		TodayIndex:     todayIndex,
		IncludeRest:    boolValue(firstValue(object, "r", "includeRest")),
		Cycle:          cycle,
	}, nil
}

// NormalizeShiftLibrary validates a user's reusable shift presets.
func NormalizeShiftLibrary(raw any) ([]ShiftPreset, error) {
	source, ok := asSlice(raw)
	if !ok {
		if object, isObject := raw.(map[string]any); isObject {
			source, ok = asSlice(object["presets"])
		}
	}
	if !ok || len(source) == 0 || len(source) > MaxShiftPresets {
		return nil, invalid("invalid_shift_library")
	}

	seen := make(map[string]struct{}, len(source))
	presets := make([]ShiftPreset, 0, len(source))
	for index, item := range source {
		object, isObject := item.(map[string]any)
		if !isObject {
			return nil, invalid("invalid_shift_library")
		}
		id := cleanText(object["id"], 80, "")
		if !presetIDPattern.MatchString(id) {
			return nil, invalid("invalid_shift_library")
		}
		if _, exists := seen[id]; exists {
			return nil, invalid("invalid_shift_library")
		}
		seen[id] = struct{}{}

		kind := "work"
		if textValue(object["kind"]) == "off" {
			kind = "off"
		}
		startFallback := "09:00"
		endFallback := "18:00"
		if kind == "off" {
			startFallback = "00:00"
			endFallback = "00:00"
		}
		start := cleanTime(textValue(object["start"]), startFallback)
		end := cleanTime(textValue(object["end"]), endFallback)
		endDayOffset := normalizeEndDayOffset(object["endDayOffset"], start, end, kind)

		if (kind == "work" || !isAllDayRest(kind, start, end, endDayOffset)) &&
			shiftDurationMinutes(start, end, endDayOffset) <= 0 {
			return nil, invalid("invalid_shift_library")
		}

		fallbackName := fmt.Sprintf("班次 %d", index+1)
		if kind == "off" {
			fallbackName = "休息"
		}
		tone := textValue(object["tone"])
		if kind == "off" && tone == "" {
			tone = "sage"
		}
		if _, exists := Tones[tone]; !exists {
			tone = "sky"
		}

		presets = append(presets, ShiftPreset{
			ID:            id,
			Kind:          kind,
			Name:          cleanText(object["name"], 28, fallbackName),
			Start:         start,
			End:           end,
			EndDayOffset:  endDayOffset,
			Tone:          tone,
			VisibleOnHome: object["visibleOnHome"] != false,
			Removable:     true,
		})
	}
	return presets, nil
}

// NormalizeUsername applies Unicode compatibility normalization and the
// instance's username rules.
func NormalizeUsername(value any) (string, error) {
	username := strings.ToLower(strings.TrimSpace(norm.NFKC.String(textValue(value))))
	length := utf8.RuneCountInString(username)
	if length < 3 || length > 24 || !usernamePattern.MatchString(username) {
		return "", invalid("invalid_username")
	}
	return username, nil
}

// NormalizePassword enforces the instance's password length rules.
func NormalizePassword(value any) (string, error) {
	password := textValue(value)
	length := utf8.RuneCountInString(password)
	if length < 8 || length > 128 {
		return "", invalid("invalid_password")
	}
	return password, nil
}

// NormalizeNickname trims display text and rejects empty values.
func NormalizeNickname(value any) (string, error) {
	nickname := cleanText(value, 30, "")
	if nickname == "" {
		return "", invalid("invalid_nickname")
	}
	return nickname, nil
}

// NormalizeInviteCode uppercases and validates an optional invite code.
func NormalizeInviteCode(value any) (string, error) {
	code := strings.ToUpper(cleanText(value, 32, ""))
	if code == "" {
		return "", nil
	}
	if !inviteCodePattern.MatchString(code) {
		return "", invalid("invalid_invite_code")
	}
	return code, nil
}

// NormalizeTimezone returns a valid IANA timezone or the configured fallback.
func NormalizeTimezone(value, fallback string) string {
	timezone := strings.TrimSpace(value)
	if _, err := time.LoadLocation(timezone); err == nil {
		return timezone
	}
	if _, err := time.LoadLocation(fallback); err == nil {
		return fallback
	}
	return "UTC"
}

func normalizeShift(source any, index int) (Shift, error) {
	var item map[string]any
	switch value := source.(type) {
	case []any:
		item = map[string]any{
			"kind":         sliceValue(value, 0),
			"name":         sliceValue(value, 1),
			"start":        sliceValue(value, 2),
			"end":          sliceValue(value, 3),
			"tone":         sliceValue(value, 4),
			"presetId":     sliceValue(value, 5),
			"endDayOffset": sliceValue(value, 6),
			"note":         sliceValue(value, 7),
		}
	case map[string]any:
		item = value
	default:
		return Shift{}, invalid("invalid_cycle")
	}

	kind := "work"
	kindValue := textValue(firstValue(item, "k", "kind"))
	if kindValue == "" {
		kindValue = "w"
	}
	if kindValue == "off" || kindValue == "o" {
		kind = "off"
	}

	nameFallback := fmt.Sprintf("班次 %d", index+1)
	startFallback := "09:00"
	endFallback := "18:00"
	if kind == "off" {
		nameFallback = "休息"
		startFallback = "00:00"
		endFallback = "00:00"
	}

	start := cleanTime(textValue(firstValue(item, "a", "start")), startFallback)
	end := cleanTime(textValue(firstValue(item, "b", "end")), endFallback)
	endDayOffset := normalizeEndDayOffset(
		firstValue(item, "e", "endDayOffset"),
		start,
		end,
		kind,
	)

	if (kind == "work" || !isAllDayRest(kind, start, end, endDayOffset)) &&
		shiftDurationMinutes(start, end, endDayOffset) <= 0 {
		return Shift{}, invalid("shift_times_match")
	}

	tone := textValue(firstValue(item, "o", "tone"))
	if tone == "" {
		if kind == "off" {
			tone = "sage"
		} else {
			tone = "sky"
		}
	}
	if _, exists := Tones[tone]; !exists {
		tone = "sky"
	}

	presetID := cleanText(firstValue(item, "p", "presetId"), 80, "")
	var preset *string
	if presetID != "" {
		preset = &presetID
	}

	return Shift{
		Kind:         kind,
		Name:         cleanText(firstValue(item, "n", "name"), 28, nameFallback),
		Start:        start,
		End:          end,
		EndDayOffset: endDayOffset,
		Tone:         tone,
		PresetID:     preset,
		Note:         cleanText(firstValue(item, "note"), MaxShiftNoteLength, ""),
	}, nil
}

func firstValue(object map[string]any, keys ...string) any {
	for _, key := range keys {
		if value, exists := object[key]; exists {
			return value
		}
	}
	return nil
}

func sliceValue(values []any, index int) any {
	if index >= len(values) {
		return nil
	}
	return values[index]
}

func asSlice(value any) ([]any, bool) {
	values, ok := value.([]any)
	return values, ok
}

func textValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case bool:
		if typed {
			return "true"
		}
		return "false"
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case json.Number:
		return typed.String()
	default:
		return fmt.Sprint(typed)
	}
}

func cleanText(value any, maxLength int, fallback string) string {
	text := strings.NewReplacer("\r", " ", "\n", " ", "\t", " ").Replace(textValue(value))
	text = strings.Join(strings.Fields(text), " ")
	runes := []rune(text)
	if len(runes) > maxLength {
		runes = runes[:maxLength]
	}
	text = strings.TrimSpace(string(runes))
	if text == "" {
		return fallback
	}
	return text
}

func cleanTime(value, fallback string) string {
	if clockPattern.MatchString(value) {
		return value
	}
	return fallback
}

func normalizeEndDayOffset(value any, start, end, kind string) int {
	offset, ok := integerValue(value)
	if ok && offset >= 0 && offset <= MaxEndDayOffset {
		return offset
	}
	if kind == "off" {
		return 0
	}
	return inferEndDayOffset(start, end)
}

func inferEndDayOffset(start, end string) int {
	startMinutes, startOK := clockMinutes(start)
	endMinutes, endOK := clockMinutes(end)
	if !startOK || !endOK {
		return 0
	}
	if endMinutes <= startMinutes {
		return 1
	}
	return 0
}

func clockMinutes(value string) (int, bool) {
	match := clockPattern.FindStringSubmatch(value)
	if match == nil {
		return 0, false
	}
	hour, _ := strconv.Atoi(match[1])
	minute, _ := strconv.Atoi(value[3:5])
	return hour*60 + minute, true
}

func shiftDurationMinutes(start, end string, endDayOffset int) int {
	startMinutes, startOK := clockMinutes(start)
	endMinutes, endOK := clockMinutes(end)
	if !startOK || !endOK || endDayOffset < 0 || endDayOffset > MaxEndDayOffset {
		return 0
	}
	return endDayOffset*24*60 + endMinutes - startMinutes
}

func isAllDayRest(kind, start, end string, endDayOffset int) bool {
	return kind == "off" && start == "00:00" && end == "00:00" && endDayOffset == 0
}

func intValue(value any, fallback int) int {
	if number, ok := integerValue(value); ok {
		return number
	}
	return fallback
}

func integerValue(value any) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case float64:
		if math.IsNaN(typed) || math.IsInf(typed, 0) || math.Trunc(typed) != typed {
			return 0, false
		}
		return int(typed), true
	case json.Number:
		number, err := strconv.ParseFloat(string(typed), 64)
		if err != nil || math.Trunc(number) != number {
			return 0, false
		}
		return int(number), true
	case string:
		number, err := strconv.ParseFloat(strings.TrimSpace(typed), 64)
		if err != nil || math.Trunc(number) != number {
			return 0, false
		}
		return int(number), true
	case bool:
		if typed {
			return 1, true
		}
		return 0, true
	default:
		return 0, false
	}
}

func boolValue(value any) bool {
	switch typed := value.(type) {
	case nil:
		return false
	case bool:
		return typed
	case string:
		return typed != ""
	case float64:
		return typed != 0 && !math.IsNaN(typed)
	case json.Number:
		number, _ := strconv.ParseFloat(string(typed), 64)
		return number != 0
	case int:
		return typed != 0
	default:
		return true
	}
}

func clamp(value, minimum, maximum int) int {
	if value < minimum {
		return minimum
	}
	if value > maximum {
		return maximum
	}
	return value
}

// CleanText normalizes display text to a single line and a maximum rune count.
func CleanText(value any, maxLength int, fallback string) string {
	return cleanText(value, maxLength, fallback)
}

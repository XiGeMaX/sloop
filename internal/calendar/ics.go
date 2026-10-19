package calendar

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const (
	defaultMemberMonths = 12
	maxMemberMonths     = 24
)

// CalendarRow is the minimum calendar data needed to build a merged feed.
type CalendarRow struct {
	ID        string
	ShareSlug string
	PlanJSON  string
}

// BuildOptions controls the generated date range and deterministic test clock.
type BuildOptions struct {
	Now          time.Time
	Months       int
	StartDate    string
	IncludeRest  *bool
	UIDNamespace string
	DefaultTZ    string
}

// BuildCalendar renders one normalized plan as an RFC 5545 calendar.
func BuildCalendar(plan Plan, options BuildOptions) (string, error) {
	now := options.Now
	if now.IsZero() {
		now = time.Now()
	}
	months := options.Months
	if months == 0 {
		months = defaultMemberMonths
	}
	if months < 1 {
		months = 1
	}
	if months > maxMemberMonths {
		months = maxMemberMonths
	}

	location, err := time.LoadLocation(plan.Timezone)
	if err != nil {
		return "", fmt.Errorf("loading plan timezone: %w", err)
	}

	start := dateParts{}
	if options.StartDate != "" {
		start, err = parseDateParts(options.StartDate)
		if err != nil {
			return "", &ValidationError{Status: 400, Code: "invalid_start_date"}
		}
	} else {
		start = zonedDateParts(now, location)
	}

	today := time.Date(start.Year, time.Month(start.Month), start.Day, 0, 0, 0, 0, time.UTC)
	backwardMonths := 0
	if plan.BackwardCycle {
		backwardMonths = plan.BackwardMonths
	}
	rangeStart := addMonths(today, -backwardMonths)
	rangeEnd := addMonths(today, months)
	stamp := formatICSTime(now)
	includeRest := plan.IncludeRest
	if options.IncludeRest != nil {
		includeRest = *options.IncludeRest
	}

	description := fmt.Sprintf("从今天起 %d 个月的周期班表", months)
	if backwardMonths > 0 {
		description = fmt.Sprintf(
			"从今天起向前 %d 个月至未来 %d 个月的周期班表",
			backwardMonths,
			months,
		)
	}

	lines := []string{
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Sloop//Shift Cycle Calendar//ZH-CN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"X-WR-CALNAME:" + EscapeText(plan.Title),
		"X-WR-TIMEZONE:" + EscapeText(plan.Timezone),
		"X-WR-CALDESC:" + EscapeText(description),
		"REFRESH-INTERVAL;VALUE=DURATION:PT1H",
		"X-PUBLISHED-TTL:PT1H",
		fmt.Sprintf("X-SLOOP-TODAY-INDEX:%d", plan.TodayIndex+1),
	}

	for dayOffset := 0; ; dayOffset++ {
		date := addDays(rangeStart, dayOffset)
		if !date.Before(rangeEnd) {
			break
		}

		offsetFromToday := int(date.Sub(today).Hours() / 24)
		cycleIndex := positiveMod(plan.TodayIndex+offsetFromToday, len(plan.Cycle))
		shift := plan.Cycle[cycleIndex]
		previousShift := plan.Cycle[positiveMod(cycleIndex-1, len(plan.Cycle))]

		if shift.Kind == "off" && !includeRest {
			continue
		}

		uidSeed := strings.Join([]string{
			options.UIDNamespace,
			strconv.Itoa(cycleIndex),
			shift.Name,
			shift.Start,
			shift.End,
			strconv.Itoa(shift.EndDayOffset),
			shift.Tone,
		}, "|")
		if options.UIDNamespace == "" {
			uidSeed = strings.TrimPrefix(uidSeed, "|")
		}
		uid := fmt.Sprintf(
			"sloop-%s-%s@shift-cycle.ics",
			formatICSDate(date),
			stableHash(uidSeed),
		)
		eventDescription := fmt.Sprintf("周期第 %d 天 · %s", cycleIndex+1, plan.Title)

		lines = append(lines,
			"BEGIN:VEVENT",
			"UID:"+uid,
			"DTSTAMP:"+stamp,
			"LAST-MODIFIED:"+stamp,
			"SEQUENCE:0",
			"SUMMARY:"+EscapeText(shift.Name),
			"DESCRIPTION:"+EscapeText(eventDescription),
			"CATEGORIES:"+EscapeText(plan.Title),
			fmt.Sprintf("X-SLOOP-CYCLE-DAY:%d", cycleIndex+1),
			fmt.Sprintf("X-SLOOP-END-DAY-OFFSET:%d", shift.EndDayOffset),
		)

		if shift.Kind == "off" {
			if isAllDayRest(shift.Kind, shift.Start, shift.End, shift.EndDayOffset) {
				previousOvernight := previousShift.Kind == "work" && previousShift.EndDayOffset == 1
				if previousOvernight {
					restHour, restMinute := parseClock(previousShift.End)
					nextDate := addDays(date, 1)
					restStartUTC := localTimeToUTC(
						date.Year(),
						int(date.Month()),
						date.Day(),
						restHour,
						restMinute,
						location,
					)
					restEndUTC := localTimeToUTC(
						nextDate.Year(),
						int(nextDate.Month()),
						nextDate.Day(),
						0,
						0,
						location,
					)
					lines = append(lines,
						"DTSTART:"+formatICSTime(restStartUTC),
						"DTEND:"+formatICSTime(restEndUTC),
					)
				} else {
					lines = append(lines,
						"DTSTART;VALUE=DATE:"+formatICSDate(date),
						"DTEND;VALUE=DATE:"+formatICSDate(addDays(date, 1)),
					)
				}
			} else {
				lines = appendTimedEvent(lines, date, shift, location)
			}
			lines = append(lines,
				"TRANSP:TRANSPARENT",
				"COLOR:"+Tones[shift.Tone],
			)
		} else {
			lines = appendTimedEvent(lines, date, shift, location)
			lines = append(lines,
				"TRANSP:OPAQUE",
				"COLOR:"+Tones[shift.Tone],
			)
		}
		lines = append(lines, "END:VEVENT")
	}

	lines = append(lines, "END:VCALENDAR")
	for index, line := range lines {
		lines[index] = FoldLine(line)
	}
	return strings.Join(lines, "\r\n") + "\r\n", nil
}

// BuildMergedCalendar combines saved plans into one feed while namespacing UIDs.
func BuildMergedCalendar(
	rows []CalendarRow,
	options BuildOptions,
) (string, error) {
	now := options.Now
	if now.IsZero() {
		now = time.Now()
	}
	defaultTimezone := options.DefaultTZ
	if defaultTimezone == "" {
		defaultTimezone = "Asia/Shanghai"
	}

	plans := make([]Plan, 0, len(rows))
	for _, row := range rows {
		raw, err := decodeJSON([]byte(row.PlanJSON))
		if err != nil {
			return "", &ValidationError{Status: 500, Code: "calendar_data_invalid"}
		}
		plan, err := NormalizePlan(raw, defaultTimezone)
		if err != nil {
			return "", &ValidationError{Status: 500, Code: "calendar_data_invalid"}
		}
		plans = append(plans, plan)
	}

	header := []string{
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Sloop//Merged Shift Cycle Calendar//ZH-CN",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"X-WR-CALNAME:Sloop 合并班表",
		"X-WR-TIMEZONE:" + EscapeText(defaultTimezone),
		"X-WR-CALDESC:" + EscapeText(fmt.Sprintf("合并 %d 个已保存周期", len(plans))),
		"REFRESH-INTERVAL;VALUE=DURATION:PT1H",
		"X-PUBLISHED-TTL:PT1H",
		fmt.Sprintf("X-SLOOP-CALENDAR-COUNT:%d", len(plans)),
	}
	for index, line := range header {
		header[index] = FoldLine(line)
	}

	var events strings.Builder
	for index, plan := range plans {
		namespace := rows[index].ShareSlug
		if namespace == "" {
			namespace = rows[index].ID
		}
		if namespace == "" {
			namespace = strconv.Itoa(index)
		}
		calendar, err := BuildCalendar(plan, BuildOptions{
			Now:          now,
			Months:       plan.DurationMonths,
			IncludeRest:  &plan.IncludeRest,
			UIDNamespace: namespace,
			DefaultTZ:    defaultTimezone,
		})
		if err != nil {
			return "", err
		}
		eventStart := strings.Index(calendar, "BEGIN:VEVENT")
		calendarEnd := strings.LastIndex(calendar, "END:VCALENDAR")
		if eventStart >= 0 && calendarEnd > eventStart {
			events.WriteString(calendar[eventStart:calendarEnd])
		}
	}

	return strings.Join(header, "\r\n") + "\r\n" + events.String() + "END:VCALENDAR\r\n", nil
}

// EscapeText escapes a value for an iCalendar text property.
func EscapeText(value string) string {
	replacer := strings.NewReplacer(
		`\`, `\\`,
		"\r\n", `\n`,
		"\n", `\n`,
		";", `\;`,
		",", `\,`,
	)
	return replacer.Replace(value)
}

// FoldLine folds a content line at 75 UTF-8 octets as required by RFC 5545.
func FoldLine(line string) string {
	var output []string
	var current strings.Builder
	bytes := 0
	firstLine := true

	for _, character := range line {
		characterValue := string(character)
		characterBytes := len(characterValue)
		limit := 75
		if !firstLine {
			limit = 74
		}
		if bytes+characterBytes > limit {
			output = append(output, current.String())
			current.Reset()
			current.WriteString(" ")
			current.WriteString(characterValue)
			bytes = 1 + characterBytes
			firstLine = false
		} else {
			current.WriteString(characterValue)
			bytes += characterBytes
		}
	}
	output = append(output, current.String())
	return strings.Join(output, "\r\n")
}

func appendTimedEvent(lines []string, date time.Time, shift Shift, location *time.Location) []string {
	startHour, startMinute := parseClock(shift.Start)
	endHour, endMinute := parseClock(shift.End)
	endDate := addDays(date, shift.EndDayOffset)
	startUTC := localTimeToUTC(
		date.Year(),
		int(date.Month()),
		date.Day(),
		startHour,
		startMinute,
		location,
	)
	endUTC := localTimeToUTC(
		endDate.Year(),
		int(endDate.Month()),
		endDate.Day(),
		endHour,
		endMinute,
		location,
	)
	return append(lines,
		"DTSTART:"+formatICSTime(startUTC),
		"DTEND:"+formatICSTime(endUTC),
	)
}

type dateParts struct {
	Year  int
	Month int
	Day   int
}

func parseDateParts(value string) (dateParts, error) {
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return dateParts{}, err
	}
	return dateParts{
		Year:  parsed.Year(),
		Month: int(parsed.Month()),
		Day:   parsed.Day(),
	}, nil
}

func zonedDateParts(timestamp time.Time, location *time.Location) dateParts {
	local := timestamp.In(location)
	return dateParts{
		Year:  local.Year(),
		Month: int(local.Month()),
		Day:   local.Day(),
	}
}

func localTimeToUTC(
	year, month, day, hour, minute int,
	location *time.Location,
) time.Time {
	wallClock := time.Date(year, time.Month(month), day, hour, minute, 0, 0, time.UTC)
	guess := wallClock
	for range 3 {
		_, offset := guess.In(location).Zone()
		adjusted := wallClock.Add(-time.Duration(offset) * time.Second)
		if adjusted.Equal(guess) {
			break
		}
		guess = adjusted
	}
	return guess.UTC()
}

func addMonths(date time.Time, months int) time.Time {
	day := date.Day()
	result := time.Date(date.Year(), date.Month(), 1, 0, 0, 0, 0, time.UTC)
	result = result.AddDate(0, months, 0)
	lastDay := time.Date(result.Year(), result.Month()+1, 0, 0, 0, 0, 0, time.UTC).Day()
	if day > lastDay {
		day = lastDay
	}
	return time.Date(result.Year(), result.Month(), day, 0, 0, 0, 0, time.UTC)
}

func addDays(date time.Time, days int) time.Time {
	return date.AddDate(0, 0, days)
}

func formatICSTime(value time.Time) string {
	return value.UTC().Format("20060102T150405Z")
}

func formatICSDate(value time.Time) string {
	return value.UTC().Format("20060102")
}

func stableHash(value string) string {
	var hash uint32 = 2166136261
	for _, character := range value {
		hash ^= uint32(character)
		hash *= 16777619
	}
	return strconv.FormatUint(uint64(hash), 36)
}

func parseClock(value string) (int, int) {
	hour, _ := strconv.Atoi(value[:2])
	minute, _ := strconv.Atoi(value[3:5])
	return hour, minute
}

func positiveMod(value, modulus int) int {
	return (value%modulus + modulus) % modulus
}

func decodeJSON(data []byte) (any, error) {
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, err
	}
	return value, nil
}

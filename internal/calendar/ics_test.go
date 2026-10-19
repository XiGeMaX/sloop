package calendar

import (
	"regexp"
	"strings"
	"testing"
	"time"
)

var testNow = time.Date(2026, 10, 18, 2, 0, 0, 0, time.UTC)

func TestBuildCalendarStartsFromSelectedShift(t *testing.T) {
	plan := mustPlan(t, samplePlanJSON)
	calendar, err := BuildCalendar(plan, BuildOptions{
		Now:       testNow,
		Months:    1,
		StartDate: "2026-10-18",
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"X-SLOOP-TODAY-INDEX:2",
		"SUMMARY:夜班",
		"DTSTART:20261018T120000Z",
		"DTEND:20261019T000000Z",
	} {
		if !strings.Contains(calendar, expected) {
			t.Errorf("calendar missing %q", expected)
		}
	}
}

func TestBuildCalendarSupportsCyclesLongerThan35Days(t *testing.T) {
	parts := make([]string, 40)
	for index := range parts {
		parts[index] = `["w","Shift ` + strings.TrimSpace(
			strings.Repeat(" ", 0),
		) + string(rune('A'+index%26)) + `","08:00","20:00","sky"]`
	}
	raw := `{
	  "t":"Long cycle","z":"Asia/Shanghai","i":0,
	  "c":[` + strings.Join(parts, ",") + `]
	}`
	plan := mustPlan(t, raw)
	calendar, err := BuildCalendar(plan, BuildOptions{
		Now:       testNow,
		Months:    2,
		StartDate: "2026-10-18",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(plan.Cycle) != 40 {
		t.Fatalf("cycle length = %d", len(plan.Cycle))
	}
	for _, expected := range []string{
		"DTSTART:20261121T000000Z",
		"X-SLOOP-CYCLE-DAY:35",
		"DTSTART:20261122T000000Z",
		"X-SLOOP-CYCLE-DAY:36",
		"DTSTART:20261127T000000Z",
		"X-SLOOP-CYCLE-DAY:1",
	} {
		if !strings.Contains(calendar, expected) {
			t.Errorf("calendar missing %q", expected)
		}
	}
}

func TestBuildCalendarSupportsMultiDayShifts(t *testing.T) {
	plan := mustPlan(t, `{
	  "t":"Shifts","z":"Asia/Shanghai","i":0,"r":1,
	  "c":[
	    ["w","24h","09:00","09:00","coral","",1],
	    ["w","48h","09:00","09:00","rose","",2]
	  ]
	}`)
	calendar, err := BuildCalendar(plan, BuildOptions{
		Now:       testNow,
		Months:    1,
		StartDate: "2026-10-18",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(
		calendar,
		"X-SLOOP-CYCLE-DAY:1\r\nX-SLOOP-END-DAY-OFFSET:1",
	) {
		t.Error("cycle day/offset order is wrong")
	}
	for _, expected := range []string{
		"DTSTART:20261018T010000Z\r\nDTEND:20261019T010000Z",
		"DTSTART:20261019T010000Z\r\nDTEND:20261021T010000Z",
	} {
		if !strings.Contains(calendar, expected) {
			t.Errorf("calendar missing %q", expected)
		}
	}
}

func TestBuildCalendarEndsPostNightRestAtEndOfDay(t *testing.T) {
	plan := mustPlan(t, samplePlanJSON)
	calendar, err := BuildCalendar(plan, BuildOptions{
		Now:       testNow,
		Months:    1,
		StartDate: "2026-10-18",
	})
	if err != nil {
		t.Fatal(err)
	}
	events := strings.Split(calendar, "BEGIN:VEVENT")
	var restEvent string
	for _, event := range events {
		if strings.Contains(event, "SUMMARY:休息") &&
			strings.Contains(event, "DTSTART:20261019T000000Z") {
			restEvent = event
			break
		}
	}
	if !strings.Contains(restEvent, "DTEND:20261019T160000Z") {
		t.Errorf("post-night rest event = %q", restEvent)
	}
	if strings.Contains(restEvent, "DTEND:20261020T000000Z") ||
		strings.Contains(restEvent, "DTSTART;VALUE=DATE") {
		t.Errorf("post-night rest was not trimmed: %q", restEvent)
	}
	if !strings.Contains(restEvent, "TRANSP:TRANSPARENT") {
		t.Error("rest event should be transparent")
	}
}

func TestBuildCalendarKeepsRegularRestAllDay(t *testing.T) {
	plan := mustPlan(t, `{
	  "t":"Shifts","z":"Asia/Shanghai","i":0,"r":1,
	  "c":[
	    ["w","Day","08:00","20:00","sky"],
	    ["o","Rest","00:00","00:00","sage"]
	  ]
	}`)
	calendar, err := BuildCalendar(plan, BuildOptions{
		Now:       testNow,
		Months:    1,
		StartDate: "2026-10-18",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(calendar, "DTSTART;VALUE=DATE:20261019") ||
		!strings.Contains(calendar, "DTEND;VALUE=DATE:20261020") {
		t.Error("regular rest was not all-day")
	}
}

func TestBuildCalendarIncludesTimedRest(t *testing.T) {
	plan := mustPlan(t, `{
	  "t":"Shifts","z":"Asia/Shanghai","i":0,"r":1,
	  "c":[["o","Timed rest","20:00","08:00","sage","",1]]
	}`)
	calendar, err := BuildCalendar(plan, BuildOptions{
		Now:       testNow,
		Months:    1,
		StartDate: "2026-10-18",
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"SUMMARY:Timed rest",
		"DTSTART:20261018T120000Z\r\nDTEND:20261019T000000Z",
		"TRANSP:TRANSPARENT",
	} {
		if !strings.Contains(calendar, expected) {
			t.Errorf("calendar missing %q", expected)
		}
	}
	if strings.Contains(calendar, "DTSTART;VALUE=DATE:20261018") {
		t.Error("timed rest was treated as all-day")
	}
}

func TestBuildCalendarUsesDateSpecificTimezones(t *testing.T) {
	plan := mustPlan(t, `{
	  "t":"New York","z":"America/New_York","i":0,
	  "c":[["w","Day","08:00","20:00","sky"]]
	}`)
	calendar, err := BuildCalendar(plan, BuildOptions{
		Now:       testNow,
		Months:    1,
		StartDate: "2026-10-31",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(calendar, "DTSTART:20261031T120000Z") ||
		!strings.Contains(calendar, "DTSTART:20261101T130000Z") {
		t.Error("daylight-saving offsets were not applied per event date")
	}
}

func TestBuildCalendarSupportsBackwardCycles(t *testing.T) {
	plan := mustPlan(t, `{
	  "t":"Backward","z":"Asia/Shanghai","i":0,"b":1,"bm":1,
	  "c":[
	    ["w","A","08:00","20:00","sky"],
	    ["w","B","08:00","20:00","indigo"],
	    ["w","C","08:00","20:00","violet"]
	  ]
	}`)
	calendar, err := BuildCalendar(plan, BuildOptions{
		Now:       testNow,
		Months:    1,
		StartDate: "2026-10-18",
	})
	if err != nil {
		t.Fatal(err)
	}
	events := strings.Split(calendar, "BEGIN:VEVENT")
	findEvent := func(date string) string {
		for _, event := range events {
			if strings.Contains(event, "DTSTART:"+date) {
				return event
			}
		}
		return ""
	}
	if findEvent("20260918T000000Z") == "" {
		t.Error("past range was not generated")
	}
	if !strings.Contains(findEvent("20261017T000000Z"), "SUMMARY:C") {
		t.Error("reverse cycle assignment is wrong")
	}
	if !strings.Contains(findEvent("20261018T000000Z"), "SUMMARY:A") {
		t.Error("today assignment is wrong")
	}
	if !strings.Contains(findEvent("20261019T000000Z"), "SUMMARY:B") {
		t.Error("next-day assignment is wrong")
	}
}

func TestBuildMergedCalendarNamespacesUIDs(t *testing.T) {
	planJSON := `{
	  "title":"Cycle A","timezone":"Asia/Shanghai","durationMonths":1,
	  "backwardCycle":false,"backwardMonths":3,"todayIndex":0,"includeRest":false,
	  "cycle":[{"kind":"work","name":"Day","start":"08:00","end":"20:00","endDayOffset":0,"tone":"sky","presetId":null}]
	}`
	calendar, err := BuildMergedCalendar([]CalendarRow{
		{ID: "calendar-a", ShareSlug: "share-a", PlanJSON: planJSON},
		{ID: "calendar-b", ShareSlug: "share-b",
			PlanJSON: strings.Replace(planJSON, "Cycle A", "Cycle B", 1)},
	}, BuildOptions{Now: testNow, DefaultTZ: "Asia/Shanghai"})
	if err != nil {
		t.Fatal(err)
	}
	uidPattern := regexp.MustCompile(`(?m)^UID:(.+)$`)
	matches := uidPattern.FindAllStringSubmatch(calendar, -1)
	seen := map[string]struct{}{}
	for _, match := range matches {
		if _, exists := seen[match[1]]; exists {
			t.Fatalf("duplicate UID %q", match[1])
		}
		seen[match[1]] = struct{}{}
	}
	if !strings.Contains(calendar, "X-SLOOP-CALENDAR-COUNT:2") ||
		!strings.Contains(calendar, "CATEGORIES:Cycle A") ||
		!strings.Contains(calendar, "CATEGORIES:Cycle B") {
		t.Error("merged calendar metadata is incomplete")
	}
	if strings.Count(calendar, "BEGIN:VCALENDAR") != 1 {
		t.Error("merged calendar has more than one VCALENDAR")
	}
}

func TestBuildMergedCalendarRejectsTrailingJSONData(t *testing.T) {
	_, err := BuildMergedCalendar([]CalendarRow{
		{
			ID:        "calendar-a",
			ShareSlug: "share-a",
			PlanJSON: `{
			  "title":"Cycle A","timezone":"Asia/Shanghai","durationMonths":1,
			  "todayIndex":0,
			  "cycle":[{"kind":"work","name":"Day","start":"08:00","end":"20:00"}]
			} trailing`,
		},
	}, BuildOptions{Now: testNow, DefaultTZ: "Asia/Shanghai"})
	if err == nil {
		t.Fatal("BuildMergedCalendar accepted trailing JSON data")
	}
}

func TestEscapeAndFoldICS(t *testing.T) {
	if actual := EscapeText(`Early, A; B\C`); actual != `Early\, A\; B\\C` {
		t.Errorf("escaped text = %q", actual)
	}
	folded := FoldLine("SUMMARY:" + strings.Repeat("班", 40))
	lines := strings.Split(folded, "\r\n")
	if len(lines) < 2 {
		t.Fatal("long line was not folded")
	}
	for _, line := range lines {
		if len([]byte(line)) > 75 {
			t.Errorf("folded line is %d bytes", len([]byte(line)))
		}
	}
}

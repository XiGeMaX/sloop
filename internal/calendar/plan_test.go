package calendar

import (
	"encoding/json"
	"strings"
	"testing"
)

const samplePlanJSON = `{
  "v": 2,
  "t": "轮转班表",
  "z": "Asia/Shanghai",
  "r": 1,
  "i": 1,
  "c": [
    ["w", "白班", "08:00", "20:00", "sky"],
    ["w", "夜班", "20:00", "08:00", "indigo"],
    ["o", "休息", "00:00", "00:00", "sage"]
  ]
}`

func decodeTestJSON(t *testing.T, value string) any {
	t.Helper()
	decoder := json.NewDecoder(strings.NewReader(value))
	decoder.UseNumber()
	var result any
	if err := decoder.Decode(&result); err != nil {
		t.Fatalf("decode test JSON: %v", err)
	}
	return result
}

func mustPlan(t *testing.T, value string) Plan {
	t.Helper()
	plan, err := NormalizePlan(decodeTestJSON(t, value), "Asia/Shanghai")
	if err != nil {
		t.Fatalf("normalize plan: %v", err)
	}
	return plan
}

func TestNormalizePlan(t *testing.T) {
	plan := mustPlan(t, samplePlanJSON)
	if plan.Title != "轮转班表" {
		t.Errorf("title = %q", plan.Title)
	}
	if len(plan.Cycle) != 3 {
		t.Fatalf("cycle length = %d", len(plan.Cycle))
	}
	if plan.TodayIndex != 1 {
		t.Errorf("today index = %d", plan.TodayIndex)
	}
	if !plan.IncludeRest {
		t.Error("include rest should be true")
	}
	if plan.Cycle[1].EndDayOffset != 1 {
		t.Errorf("overnight offset = %d", plan.Cycle[1].EndDayOffset)
	}
}

func TestNormalizePlanPreservesPresetReference(t *testing.T) {
	plan := mustPlan(t, `{
	  "t": "Shifts",
	  "z": "Asia/Shanghai",
	  "c": [["w", "Day", "08:00", "20:00", "sky", "day", 0, "Bring access card"]]
	}`)
	if plan.Cycle[0].PresetID == nil || *plan.Cycle[0].PresetID != "day" {
		t.Fatalf("preset ID = %#v", plan.Cycle[0].PresetID)
	}
	if plan.Cycle[0].Note != "Bring access card" {
		t.Fatalf("note = %q", plan.Cycle[0].Note)
	}
}

func TestNormalizePlanDurationAndBackwardLimits(t *testing.T) {
	tests := []struct {
		name           string
		raw            string
		durationMonths int
		backwardMonths int
		backwardCycle  bool
	}{
		{
			name:           "defaults",
			raw:            samplePlanJSON,
			durationMonths: 12,
			backwardMonths: 3,
		},
		{
			name: "custom",
			raw: `{
			  "t":"Shifts","z":"Asia/Shanghai","d":18,"b":1,"bm":5,
			  "c":[["w","Day","08:00","20:00","sky"]]
			}`,
			durationMonths: 18,
			backwardMonths: 5,
			backwardCycle:  true,
		},
		{
			name: "capped",
			raw: `{
			  "t":"Shifts","z":"Asia/Shanghai","d":99,"b":1,"bm":99,
			  "c":[["w","Day","08:00","20:00","sky"]]
			}`,
			durationMonths: 24,
			backwardMonths: 24,
			backwardCycle:  true,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			plan := mustPlan(t, test.raw)
			if plan.DurationMonths != test.durationMonths {
				t.Errorf("duration = %d, want %d", plan.DurationMonths, test.durationMonths)
			}
			if plan.BackwardMonths != test.backwardMonths {
				t.Errorf("backward months = %d, want %d", plan.BackwardMonths, test.backwardMonths)
			}
			if plan.BackwardCycle != test.backwardCycle {
				t.Errorf("backward cycle = %v", plan.BackwardCycle)
			}
		})
	}
}

func TestNormalizePlanSupportsMultiDayShifts(t *testing.T) {
	plan := mustPlan(t, `{
	  "t":"Shifts",
	  "z":"Asia/Shanghai",
	  "c":[
	    ["w","24h","09:00","09:00","coral","",1],
	    ["w","48h","09:00","09:00","rose","",2]
	  ]
	}`)
	if plan.Cycle[0].EndDayOffset != 1 || plan.Cycle[1].EndDayOffset != 2 {
		t.Fatalf("offsets = %d, %d", plan.Cycle[0].EndDayOffset, plan.Cycle[1].EndDayOffset)
	}
}

func TestNormalizePlanRejectsEqualStartAndEnd(t *testing.T) {
	_, err := NormalizePlan(decodeTestJSON(t, `{
	  "t":"Shifts",
	  "z":"Asia/Shanghai",
	  "c":[["w","Invalid","09:00","09:00","sky","",0]]
	}`), "Asia/Shanghai")
	if err == nil || err.Error() != "shift_times_match" {
		t.Fatalf("error = %v", err)
	}
}

func TestNormalizeShiftLibrary(t *testing.T) {
	presets, err := NormalizeShiftLibrary(decodeTestJSON(t, `{
	  "presets":[
	    {"id":"day","kind":"work","name":"Day","start":"08:00","end":"20:00","tone":"sky"},
	    {"id":"custom-24","kind":"work","name":"24h","start":"09:00","end":"09:00","endDayOffset":1,"tone":"coral","visibleOnHome":false},
	    {"id":"custom-rest","kind":"off","name":"Rest","start":"20:00","end":"08:00","endDayOffset":1,"tone":"sage"}
	  ]
	}`))
	if err != nil {
		t.Fatal(err)
	}
	if len(presets) != 3 {
		t.Fatalf("presets = %d", len(presets))
	}
	if !presets[0].Removable || !presets[0].VisibleOnHome {
		t.Error("default preset flags are wrong")
	}
	if presets[1].VisibleOnHome || presets[1].EndDayOffset != 1 {
		t.Error("custom 24h preset was not normalized")
	}
	if presets[2].Kind != "off" || presets[2].EndDayOffset != 1 {
		t.Error("timed rest preset was not normalized")
	}
}

func TestNormalizeIdentityFields(t *testing.T) {
	username, err := NormalizeUsername("  Sloop_User  ")
	if err != nil || username != "sloop_user" {
		t.Fatalf("username = %q, err = %v", username, err)
	}
	username, err = NormalizeUsername("值班员-01")
	if err != nil || username != "值班员-01" {
		t.Fatalf("unicode username = %q, err = %v", username, err)
	}
	if _, err := NormalizeUsername("not an email"); err == nil {
		t.Error("invalid username was accepted")
	}
	nickname, err := NormalizeNickname("  小 林  ")
	if err != nil || nickname != "小 林" {
		t.Fatalf("nickname = %q, err = %v", nickname, err)
	}
	if _, err := NormalizeNickname("   "); err == nil {
		t.Error("empty nickname was accepted")
	}
}

# 班次周期独立导出与解析规范

> 适用版本：Sloop 当前仓库 `main` 分支
> 文档版本：1.0
> 目标读者：需要从 Sloop 导出班次周期，或需要在其他软件中解析、转换、再导入周期的开发者

## 1. 结论先行

如果接收方只需要日历事件，下载单份周期的 `.ics` 即可。`.ics` 是标准格式，Google Calendar、Apple Calendar、Outlook 等软件通常可以直接导入或订阅，但它是已经展开成有限日期的事件集合，不能完整还原原来的“几天一循环”模板。

如果接收方需要保留班次周期本身，例如换到排班软件、做数据分析、生成自己的日历事件，或者在另一套系统中继续编辑，应使用 JSON 周期快照。JSON 能保存周期顺序、时区、跨夜偏移、休息日、备注和锚点位置。

当前项目已有两种与周期相关的输出：

| 输出 | 当前是否直接面向用户 | 能否还原周期 | 主要用途 |
| --- | --- | --- | --- |
| 单周期 `.ics` 下载 | 是 | 否 | 导入日历软件或做事件级交换 |
| `#share=z.*` 分享链接 | 是 | 是 | 在 Sloop 中分享和导入周期 |
| 独立周期 JSON | 数据已经包含在分享载荷中，但当前没有单独的“下载 JSON”按钮 | 是 | 供其他软件解析、转换和长期保存 |

其他软件开发者应优先实现本文第 5 节的 JSON 契约。只有目标软件只能接受日历时，才改用第 8 节的 `.ics`。

最重要的一条约束是：**`todayIndex` 只是周期内的锚点位置，不是日期。** 若要把周期还原成某一天对应的班次，导出方必须同时保存一个 `anchorDate`，或由接收方明确要求用户指定参考日期。只拿到 `todayIndex` 的软件无法判断 2026-10-21 应该是夜班还是休息。

当前 Sloop 的单周期订阅在生成 `.ics` 时，会把“请求当天”视为锚点日期，因此分享载荷本身没有保存历史相位。本文建议独立导出时在 `plan.anchorDate` 中增加 `YYYY-MM-DD` 日期；Sloop 当前导入逻辑会忽略这个扩展字段，所以不会破坏再导入，但再次从 Sloop 导出后该字段可能丢失。

## 2. 适用范围与术语

本文规定三件事：

1. 一个班次周期在 JSON 中应如何表达。
2. Sloop 当前 `z.*` 分享载荷如何解码和校验。
3. 如何把周期展开成真实日期，以及如何生成可被日历软件接收的 `.ics`。

本文不把 Sloop 的登录 Cookie、内部管理 API、数据库表结构或订阅签名密钥定义为公共接口。外部软件不应依赖 SQLite 文件、页面 DOM 或未声明的内部实现。

| 术语 | 含义 |
| --- | --- |
| 周期模板 | 一个可重复的班次序列，例如“白班、白班、夜班、休息、休息” |
| 周期长度 | 模板中班次项的个数，不要求等于 7、28 或 35 |
| 周期项 | 模板中的一个位置。它表示某一种班次，而不是某个绝对日期 |
| 锚点位置 | `todayIndex`，从 0 开始计数，指定某个参考日期对应周期中的第几项 |
| 参考日期 | `anchorDate`，与锚点位置配对使用的本地日期，格式为 `YYYY-MM-DD` |
| 班次预设 | 可复用的班次定义。它可以辅助编辑，但不是日历事件生成的必要条件 |
| 班次实例 | 把周期项落到某个具体日期后形成的事件 |
| 结束日偏移 | `endDayOffset`，表示结束时间在开始日之后第几天的同一本地时钟时间 |

这里的“天”指所选 IANA 时区中的本地日历日。夏令时切换日可能是 23 小时或 25 小时，因此不应把“一天”简单换算为固定 86,400 秒来推导班次顺序。

## 3. 三种导出形态

### 3.1 单周期 `.ics`

适合：

- 把一份周期导入 Google Calendar、Apple Calendar、Outlook 等日历软件。
- 让另一套系统读取已经展开的事件，而不关心周期模板本身。
- 使用 `webcal:` 或 HTTPS 订阅一个持续更新的日历源。

不适合：

- 恢复“第 3 天是夜班”这类模板结构。
- 在排班软件中继续拖动、修改周期顺序。
- 仅凭事件数量判断周期长度。跨夜、多日班次和休息过滤都会改变事件数量。

`.ics` 导出是某个时间窗口内的快照。Sloop 当前按周期设置生成 1 到 24 个月的有限事件，不依赖无限循环规则。重新生成时，事件窗口可能随当前日期移动。

### 3.2 Sloop 分享链接

分享链接形如：

```text
https://sloop.example/#share=z.LqCn...
```

其中 `z.` 后面是压缩后的周期定义包。它可以包含：

- 周期标题、时区、时长、锚点位置和班次顺序。
- 每个班次的名称、开始时间、结束时间、结束日偏移、颜色和可选备注。
- 周期实际引用到的班次预设。

分享链接是“自包含快照”，不是服务端资源。链接一旦生成，即使原周期后来被修改，接收者导入的仍是生成链接时的版本。

### 3.3 独立周期 JSON

推荐给需要解析周期结构的软件。它使用本文第 5 节定义的展开字段，而不是页面内部的编辑状态。它可以用于：

- 导入到自建排班系统。
- 转换成 CSV、数据库记录或接口对象。
- 在不同设备之间保存模板。
- 生成其他格式的日历文件。

当前 UI 没有独立的 JSON 下载按钮；可以从 Sloop 分享链接解码得到同一个数据包，也可以由后端或导出工具按本文契约生成。若产品后续增加“导出 JSON”按钮，建议：

- 直接下载规范化后的展开 JSON。
- 文件名使用 `<安全标题>.sloop-cycle.json`。
- HTTP 类型使用 `application/json; charset=utf-8`，或注册专用类型 `application/vnd.sloop.cycle+json`。
- 明确写入 `anchorDate`，不要只依赖 `todayIndex`。

### 3.4 形态选择表

| 需求 | 首选形态 | 原因 |
| --- | --- | --- |
| 在手机或电脑日历里看班 | `.ics` | 标准、成熟、无需自行展开事件 |
| 保留循环模板 | JSON / 分享载荷 | 保留周期数组和跨夜信息 |
| 在 Sloop 之间传递 | `z.*` 分享链接 | 可直接导入，包含所需预设 |
| 给 Excel 或 BI 做统计 | 由 JSON 展开成表格 | CSV 不适合直接承载循环语义 |
| 自建服务定时生成事件 | JSON | 可按锚点、时区和结束日偏移计算 |

## 4. 周期数据模型

### 4.1 周期对象

规范化后的周期对象建议使用下面这些字段。它们是当前服务端存储和返回的展开形式。

| 字段 | 类型 | 必需 | 约束与含义 |
| --- | --- | --- | --- |
| `title` | string | 是 | 日历或周期名称，最长 64 个 Unicode 码点；空白会被压缩为单个空格 |
| `timezone` | string | 是 | IANA 时区名，例如 `Asia/Shanghai`、`America/New_York`；不要使用 `GMT+8` 这类固定偏移替代地区时区 |
| `durationMonths` | integer | 是 | 向参考日期之后生成多少个月，范围 1 到 24；默认 12 |
| `backwardCycle` | boolean | 是 | 是否同时生成参考日期之前的历史区间 |
| `backwardMonths` | integer | 是 | 历史区间月数，范围 1 到 24；仅在 `backwardCycle=true` 时有展开意义 |
| `todayIndex` | integer | 是 | 锚点位置，从 0 开始，必须满足 `0 <= todayIndex < cycle.length` |
| `includeRest` | boolean | 是 | `.ics` 生成时是否包含 `kind=off` 的休息事件 |
| `cycle` | Shift[] | 是 | 至少一个周期项；本文不设固定上限，但分享链接有长度限制 |
| `anchorDate` | string | 建议 | `YYYY-MM-DD` 本地日期，表示 `todayIndex` 实际对应的日期；当前 Sloop 不自动写入 |

`anchorDate` 是兼容扩展字段。当前的 Sloop 导入逻辑会忽略它，因此外部工具可以在不改变原周期的前提下携带真实日期锚点。如果接收方不需要历史或未来绝对日期，可以省略；如果要把周期落成事件，应当保留。

### 4.2 班次对象 `Shift`

| 字段 | 类型 | 必需 | 约束与含义 |
| --- | --- | --- | --- |
| `kind` | string | 是 | `work` 或 `off` |
| `name` | string | 是 | 展示名称，最长 28 个 Unicode 码点 |
| `start` | string | 是 | 24 小时制 `HH:MM`，范围 `00:00` 到 `23:59` |
| `end` | string | 是 | 24 小时制 `HH:MM`，范围 `00:00` 到 `23:59` |
| `endDayOffset` | integer | 是 | 结束时间相对开始日的偏移，范围 0 到 7 |
| `tone` | string | 是 | 稳定颜色名；未知值按 `sky` 处理 |
| `presetId` | string or null | 是 | 预设 ID；纯内联班次使用 `null`；字符串只允许 `[A-Za-z0-9_-]`，最长 80 |
| `note` | string | 否 | 班次备注，最长 500 个 Unicode 码点；缺省等价于空字符串 |

`kind=work` 表示工作班次。`kind=off` 可以表示休息日，也可以表示一个有具体时间窗的休息时段。

### 4.3 时间与结束日偏移

班次持续时间按以下公式计算：

```text
开始分钟 = start.hour * 60 + start.minute
结束分钟 = end.hour * 60 + end.minute
持续分钟 = endDayOffset * 1440 + 结束分钟 - 开始分钟
```

有效规则：

- `work` 班次必须满足 `持续分钟 > 0`。
- `off` 且 `start=00:00`、`end=00:00`、`endDayOffset=0` 时，表示全天休息。
- `off` 但不是全天休息时，也必须满足 `持续分钟 > 0`。
- `start == end` 本身不能说明是 0 小时、24 小时还是 48 小时，必须结合 `endDayOffset`。
- `09:00 -> 09:00, endDayOffset=0` 非法。
- `09:00 -> 09:00, endDayOffset=1` 表示 24 小时。
- `09:00 -> 09:00, endDayOffset=2` 表示 48 小时。
- `20:00 -> 08:00, endDayOffset=1` 表示跨夜 12 小时。

如果导入格式缺少 `endDayOffset`，Sloop 的兼容规则是：

- `work`：当结束分钟小于或等于开始分钟时推断为 1，否则推断为 0。
- `off`：推断为 0。

这条推断规则只为兼容旧数据。本文建议新导出始终显式写出 `endDayOffset`，否则接收方无法区分钟面时间相同但持续 24 小时、48 小时或更久的班次。

### 4.4 休息与跨夜

休息项不要自行改写成另一个 `kind`。接收方应同时保留 `kind`、时间和结束日偏移：

| 表达 | 含义 |
| --- | --- |
| `off`, `00:00`, `00:00`, `0` | 全天休息 |
| `off`, `20:00`, `08:00`, `1` | 从当天 20:00 到次日 08:00 的休息时段 |
| `off`, `00:00`, `00:00`, `1` | 24 小时休息时段，不是全天事件 |

Sloop 在生成 `.ics` 时会对一种特殊情况进行修剪：如果某个全天休息日的前一个周期项是跨夜工作班次且 `endDayOffset=1`，休息事件从上一班次结束时刻开始，到当天 24:00 结束，而不是从当天 00:00 开始。这样可避免与已经延伸到当天的夜班重复。

多日班次可能与其他周期项重叠。Sloop 不做冲突检测，也不会自动缩短重叠事件。接收方应保留原始起止时间，并在展示层决定如何标记冲突。

### 4.5 颜色名

Sloop 使用稳定的颜色标识，不保证其他软件存在同名颜色。推荐按下表转换：

| `tone` | 颜色值 | `tone` | 颜色值 |
| --- | --- | --- | --- |
| `sky` | `#2f7fda` | `indigo` | `#5665df` |
| `violet` | `#7654d6` | `plum` | `#8e5bc0` |
| `fuchsia` | `#bc3fa4` | `rose` | `#d74481` |
| `berry` | `#a94774` | `red` | `#ca3d4c` |
| `orange` | `#dd5f26` | `coral` | `#df7059` |
| `clay` | `#ad6044` | `amber` | `#bd8212` |
| `sun` | `#cfa11d` | `lime` | `#789e24` |
| `sage` | `#3d8c63` | `emerald` | `#178b65` |
| `teal` | `#148680` | `slate` | `#536b87` |

颜色没有班次语义。不要根据 `tone` 判断白班、夜班或休息，必须使用 `kind` 和具体时间。

### 4.6 名称和备注不是标识符

以下字段只用于展示，不应当作为跨系统主键：

- `title`
- `name`
- `note`
- `tone`

周期项本身在紧凑格式中没有稳定 ID，只有数组位置。跨系统同步时，建议由接收方生成自己的事件 ID，或使用第 8.5 节的 `.ics` UID。

### 4.7 标题、名称和备注清洗

Sloop 写入前会：

- 把回车、换行和制表符替换为空格。
- 合并连续空白。
- 去掉首尾空白。
- 按 Unicode 码点截断，而不是按 UTF-16 代码单元或用户可见字素簇截断。
- 对空标题、空名称使用默认文本。

外部接收方仍应做自己的长度限制和 HTML 转义。不要因为字段来自 Sloop 就把其文本直接插入 HTML、SQL 或命令行。

## 5. 独立周期 JSON 契约

### 5.1 推荐对象结构

独立 JSON 推荐直接使用 Sloop 分享载荷解码后的结构：

```json
{
  "v": 1,
  "type": "sloop-cycle-share",
  "plan": {
    "anchorDate": "2026-10-21",
    "title": "四班轮转",
    "timezone": "Asia/Shanghai",
    "durationMonths": 12,
    "backwardCycle": false,
    "backwardMonths": 3,
    "todayIndex": 1,
    "includeRest": true,
    "cycle": [
      {
        "kind": "work",
        "name": "白班",
        "start": "08:00",
        "end": "20:00",
        "endDayOffset": 0,
        "tone": "sky",
        "presetId": "day",
        "note": "带门禁卡"
      },
      {
        "kind": "work",
        "name": "夜班",
        "start": "20:00",
        "end": "08:00",
        "endDayOffset": 1,
        "tone": "indigo",
        "presetId": "night"
      },
      {
        "kind": "off",
        "name": "休息",
        "start": "00:00",
        "end": "00:00",
        "endDayOffset": 0,
        "tone": "sage",
        "presetId": "off"
      },
      {
        "kind": "work",
        "name": "24 小时值班",
        "start": "09:00",
        "end": "09:00",
        "endDayOffset": 1,
        "tone": "coral",
        "presetId": "long-24"
      }
    ]
  },
  "presets": [
    {
      "id": "day",
      "kind": "work",
      "name": "白班",
      "start": "08:00",
      "end": "20:00",
      "endDayOffset": 0,
      "tone": "sky",
      "visibleOnHome": true
    },
    {
      "id": "night",
      "kind": "work",
      "name": "夜班",
      "start": "20:00",
      "end": "08:00",
      "endDayOffset": 1,
      "tone": "indigo",
      "visibleOnHome": true
    },
    {
      "id": "off",
      "kind": "off",
      "name": "休息",
      "start": "00:00",
      "end": "00:00",
      "endDayOffset": 0,
      "tone": "sage",
      "visibleOnHome": true
    },
    {
      "id": "long-24",
      "kind": "work",
      "name": "24 小时值班",
      "start": "09:00",
      "end": "09:00",
      "endDayOffset": 1,
      "tone": "coral",
      "visibleOnHome": false
    }
  ]
}
```

这个例子表示：

- 2026-10-21 对应周期第 2 项，即数组下标 1 的夜班。
- 2026-10-22 对应休息。
- 2026-10-23 对应 24 小时值班。
- 2026-10-24 对应白班。
- 之后继续按 4 天循环。

`presets` 是辅助数据。接收方如果只需要生成事件，可以直接忽略 `presets`，因为 `plan.cycle` 的每一项已经包含时间。接收方如果要编辑班次库，才需要读取 `presets`。

### 5.2 顶层字段

| 字段 | 类型 | 必需 | 含义 |
| --- | --- | --- | --- |
| `v` | integer | 是 | 分享对象版本，当前固定为 `1` |
| `type` | string | 是 | 固定为 `sloop-cycle-share` |
| `plan` | object | 是 | 展开或紧凑周期对象 |
| `presets` | array | 是 | 周期引用到的预设；没有引用时使用空数组 |

当前 Sloop 解码器会检查：

- `type === "sloop-cycle-share"`。
- `v === 1`。
- `plan` 必须存在。
- `presets` 必须是数组。

它不会在解码阶段完整校验 `plan.cycle`。真正导入时还会经过一次周期规范化，因此外部工具不能把“能被解压”当成“数据一定合法”。

### 5.3 预设对象

分享载荷中的预设使用展开字段：

| 字段 | 类型 | 约束 |
| --- | --- | --- |
| `id` | string | 唯一预设 ID，匹配 `^[A-Za-z0-9_-]+$`，最长 80 |
| `kind` | string | `work` 或 `off` |
| `name` | string | 最长 28 |
| `start` | string | `HH:MM` |
| `end` | string | `HH:MM` |
| `endDayOffset` | integer | 0 到 7 |
| `tone` | string | 颜色名 |
| `visibleOnHome` | boolean | 是否出现在首页快捷班次栏 |

分享载荷不包含本地编辑字段 `removable`。导入方不要把它当作业务数据。

预设 ID 只保证在同一个数据包内有意义。不同用户或不同实例可能使用相同 ID 表示不同班次。导入时推荐按以下顺序匹配：

1. `kind + name + start + end + endDayOffset + tone` 完全一致。
2. ID 和班次核心时间字段均一致。
3. 否则视为缺失预设，要求用户创建或仅保留内联班次。

不要只按 `id` 匹配，否则可能把“夜班”错误映射到另一个账号的同名 ID。

### 5.4 紧凑周期格式

Sloop 前端保存和分享时通常使用紧凑字段，以缩短链接。文档中的接收方可以支持它，但新的独立导出建议使用展开字段。

周期对象别名：

| 展开字段 | 紧凑字段 | 说明 |
| --- | --- | --- |
| `title` | `t` | 标题 |
| `timezone` | `z` | IANA 时区 |
| `includeRest` | `r` | 布尔值兼容 `0/1` |
| `durationMonths` | `d` | 未来月数 |
| `backwardCycle` | `b` | 布尔值兼容 `0/1` |
| `backwardMonths` | `bm` | 历史月数 |
| `todayIndex` | `i` | 0 开始的位置 |
| `cycle` | `c` | 班次数组 |

一个紧凑周期项是一个数组，顺序固定：

```text
[
  0  kindShort,       // "w" 或 "o"
  1  name,            // string
  2  start,           // "HH:MM"
  3  end,             // "HH:MM"
  4  tone,            // string
  5  presetId,        // string；空串等价于 null
  6  endDayOffset,    // integer
  7  note             // optional string
]
```

示例：

```json
{
  "v": 2,
  "t": "四班轮转",
  "z": "Asia/Shanghai",
  "r": 1,
  "d": 12,
  "b": 0,
  "bm": 3,
  "i": 1,
  "c": [
    ["w", "白班", "08:00", "20:00", "sky", "day", 0, "带门禁卡"],
    ["w", "夜班", "20:00", "08:00", "indigo", "night", 1],
    ["o", "休息", "00:00", "00:00", "sage", "off", 0],
    ["w", "24 小时值班", "09:00", "09:00", "coral", "long-24", 1]
  ]
}
```

注意事项：

- `v: 2` 是前端保存格式提示，当前服务端规范化不依赖该值。
- `anchorDate` 没有紧凑别名，应直接加在周期对象上。
- `c` 或 `cycle` 至少有一个元素。
- 数组位置就是周期位置，不能按 `presetId` 重新排序。
- 数组第 5 项为空字符串时，表示没有引用预设，应在内部转换为 `null` 或直接使用内联时间。
- 第 7 项缺失等价于空备注，不要用 `null` 参与字符串拼接。

### 5.5 规范化 JSON Schema

下面是用于独立 JSON 的参考 schema。它不能表达 `todayIndex < cycle.length`、实际日期是否有效等跨字段约束，这些仍需业务代码校验。

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:sloop:cycle-share:v1",
  "type": "object",
  "required": ["v", "type", "plan", "presets"],
  "properties": {
    "v": { "const": 1 },
    "type": { "const": "sloop-cycle-share" },
    "plan": {
      "type": "object",
      "required": [
        "title",
        "timezone",
        "durationMonths",
        "backwardCycle",
        "backwardMonths",
        "todayIndex",
        "includeRest",
        "cycle"
      ],
      "properties": {
        "title": { "type": "string", "maxLength": 64 },
        "timezone": { "type": "string", "minLength": 1 },
        "durationMonths": { "type": "integer", "minimum": 1, "maximum": 24 },
        "backwardCycle": { "type": "boolean" },
        "backwardMonths": { "type": "integer", "minimum": 1, "maximum": 24 },
        "todayIndex": { "type": "integer", "minimum": 0 },
        "includeRest": { "type": "boolean" },
        "anchorDate": {
          "type": "string",
          "format": "date",
          "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
        },
        "cycle": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/$defs/shift" }
        }
      },
      "additionalProperties": true
    },
    "presets": {
      "type": "array",
      "items": { "$ref": "#/$defs/preset" }
    }
  },
  "additionalProperties": true,
  "$defs": {
    "clock": {
      "type": "string",
      "pattern": "^([01][0-9]|2[0-3]):[0-5][0-9]$"
    },
    "shift": {
      "type": "object",
      "required": [
        "kind",
        "name",
        "start",
        "end",
        "endDayOffset",
        "tone",
        "presetId"
      ],
      "properties": {
        "kind": { "enum": ["work", "off"] },
        "name": { "type": "string", "maxLength": 28 },
        "start": { "$ref": "#/$defs/clock" },
        "end": { "$ref": "#/$defs/clock" },
        "endDayOffset": { "type": "integer", "minimum": 0, "maximum": 7 },
        "tone": {
          "enum": [
            "sky", "indigo", "violet", "plum", "fuchsia", "rose",
            "berry", "red", "orange", "coral", "clay", "amber",
            "sun", "lime", "sage", "emerald", "teal", "slate"
          ]
        },
        "presetId": {
          "oneOf": [
            { "type": "null" },
            { "type": "string", "maxLength": 80, "pattern": "^[A-Za-z0-9_-]+$" }
          ]
        },
        "note": { "type": "string", "maxLength": 500 }
      },
      "additionalProperties": true
    },
    "preset": {
      "type": "object",
      "required": [
        "id", "kind", "name", "start", "end",
        "endDayOffset", "tone", "visibleOnHome"
      ],
      "properties": {
        "id": {
          "type": "string",
          "minLength": 1,
          "maxLength": 80,
          "pattern": "^[A-Za-z0-9_-]+$"
        },
        "kind": { "enum": ["work", "off"] },
        "name": { "type": "string", "maxLength": 28 },
        "start": { "$ref": "#/$defs/clock" },
        "end": { "$ref": "#/$defs/clock" },
        "endDayOffset": { "type": "integer", "minimum": 0, "maximum": 7 },
        "tone": {
          "enum": [
            "sky", "indigo", "violet", "plum", "fuchsia", "rose",
            "berry", "red", "orange", "coral", "clay", "amber",
            "sun", "lime", "sage", "emerald", "teal", "slate"
          ]
        },
        "visibleOnHome": { "type": "boolean" }
      },
      "additionalProperties": true
    }
  }
}
```

校验 `anchorDate` 时不要只依赖 schema 的 `format`。有些运行时默认不执行 format 校验，应再确认日期真实存在，例如 `2026-02-30` 必须被拒绝。

Schema 中的 `tone` 枚举定义的是**规范化导出值**。Sloop 在导入旧数据或手工数据时，会把未知颜色容错降级为 `sky`；这不意味着未知颜色是合法的规范化输出。严格接收方可以拒绝未知颜色，也可以采用同样的 `sky` 降级，但必须在自己的实现中明确选择。

### 5.6 严格接收方校验建议

独立接收方建议执行以下检查：

1. 顶层 `v`、`type` 是否符合支持版本。
2. `plan` 和 `presets` 是否为正确类型。
3. `cycle` 是否非空。
4. 所有时间是否符合 `HH:MM`，结束日偏移是否在 0 到 7。
5. 每个工作班次和定时休息的持续时间是否大于 0。
6. `todayIndex` 是否指向有效数组位置。
7. `timezone` 是否能被 IANA 时区数据库解析。
8. `anchorDate` 是否存在且为真实日期。
9. 文本长度、控制字符和备注是否需要过滤。
10. 预设 ID 是否重复，引用是否存在。

严格接收方遇到非法数据时应当拒绝整包，而不是只生成一半事件。否则用户会得到看似成功、实际缺少班次的日历。

## 6. 压缩分享载荷 `z.*`

### 6.1 编码链路

分享链接的生成顺序是：

```text
周期 JSON
  -> 打包成 wire 数组 [1, plan, presets]
  -> JSON.stringify / UTF-8
  -> deflate-raw 压缩
  -> base64url，去掉末尾的 "="
  -> 加上 "z." 前缀
  -> 放入 URL 的 #share=... 或 ?share=...
```

`deflate-raw` 是原始 DEFLATE 数据流，不带 gzip 头或 zlib 头。用错算法会解码失败。

### 6.2 wire 数组

解压后的 JSON 不是第 5 节示例中的对象，而是一个固定三元素数组：

```json
[
  1,
  {
    "t": "四班轮转",
    "z": "Asia/Shanghai",
    "r": 1,
    "d": 12,
    "b": 0,
    "bm": 3,
    "i": 0,
    "c": [
      ["w", "白班", "08:00", "20:00", "sky", "day", 0, ""]
    ]
  },
  [
    ["day", "w", "白班", "08:00", "20:00", 0, "sky", 1],
    ["night", "w", "夜班", "20:00", "08:00", 1, "indigo", 1]
  ]
]
```

三个位置分别是：

| 下标 | 内容 |
| --- | --- |
| `0` | wire 版本，当前必须为 `1` |
| `1` | 原始 `plan`，可以是紧凑格式，也可以是展开格式 |
| `2` | 预设元组数组 |

预设元组顺序固定：

```text
[
  0  id,
  1  kindShort,       // "w" 或 "o"
  2  name,
  3  start,
  4  end,
  5  endDayOffset,
  6  tone,
  7  visibleOnHome     // 1 或 0
]
```

解码器应把 wire 数组还原为共享对象：

```json
{
  "v": 1,
  "type": "sloop-cycle-share",
  "plan": {},
  "presets": []
}
```

注意：顶层 `anchorDate` 如果直接放在共享对象上，当前 Sloop 的 `unpackSharePackage` 不会保留它。需要稳定日期时，应把 `anchorDate` 放在 `plan` 对象内部。

### 6.3 输入提取规则

当前 Sloop 接受：

- 纯 token：`z.LqCn...`
- 带 hash 的链接：`https://sloop.example/#share=z.LqCn...`
- 带 query 的链接：`https://sloop.example/?share=z.LqCn...`

纯 token 只允许 `[A-Za-z0-9_.-]`。如果输入是 URL，解析器会读取 `#share` 或 `?share`。

外部接收方如果只处理文件，可以直接接受 JSON；如果要求与 Sloop 分享链接互通，则必须支持 `z.*` 压缩 token。

### 6.4 当前限制

| 限制 | 当前值 |
| --- | --- |
| 原始输入字符串最大长度 | 24,000 字符 |
| token 最大长度 | 20,000 字符 |
| 解压后 JSON 最大长度 | 100,000 字节 |
| wire 版本 | 1 |
| 共享对象版本 | 1 |

这些限制用于防止超长链接和解压炸弹。外部实现必须至少在解压后检查字节上限，不能待读完无限输出后再判断。

周期长度本身没有固定上限，但周期越长、备注越多，压缩 token 越可能超过 20,000 字符。此时：

- `.ics` 仍可能正常生成。
- 应改用独立 JSON 或服务端导出。
- 不应通过删除班次来“适配”链接长度，否则会改变周期语义。

### 6.5 Python 解码示例

下面的示例带解压上限和结构检查：

```python
import base64
import json
import re
import zlib
from urllib.parse import parse_qs, urlsplit

MAX_TOKEN_LENGTH = 20_000
MAX_DECODED_BYTES = 100_000
CLOCK_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def extract_token(value: str) -> str:
    value = value.strip()
    if not value or len(value) > 24_000:
        raise ValueError("invalid_share_link")

    if value.startswith("z.") and re.fullmatch(r"[A-Za-z0-9_.-]+", value):
        return value

    parsed = urlsplit(value)
    from_hash = parse_qs(parsed.fragment).get("share", [])
    from_query = parse_qs(parsed.query).get("share", [])
    token = (from_hash or from_query or [""])[0]
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", token):
        raise ValueError("invalid_share_link")
    return token


def decode_share_token(value: str) -> dict:
    token = extract_token(value)
    if not token.startswith("z."):
        raise ValueError("invalid_share_link")
    if len(token) > MAX_TOKEN_LENGTH:
        raise ValueError("share_link_too_large")

    encoded = token[2:]
    if not re.fullmatch(r"[A-Za-z0-9_-]+", encoded) or len(encoded) % 4 == 1:
        raise ValueError("invalid_share_link")
    padded = encoded + "=" * ((4 - len(encoded) % 4) % 4)
    compressed = base64.urlsafe_b64decode(padded)

    inflater = zlib.decompressobj(-zlib.MAX_WBITS)
    raw = inflater.decompress(compressed, MAX_DECODED_BYTES + 1)
    if (
        len(raw) > MAX_DECODED_BYTES
        or inflater.unconsumed_tail
        or not inflater.eof
    ):
        raise ValueError("share_link_too_large_or_invalid")

    wire = json.loads(raw.decode("utf-8"))
    if not isinstance(wire, list) or len(wire) < 3 or wire[0] != 1:
        raise ValueError("invalid_share_link")

    plan, preset_rows = wire[1], wire[2]
    if not isinstance(plan, dict) or not isinstance(preset_rows, list):
        raise ValueError("invalid_share_link")

    presets = []
    for row in preset_rows:
        if not isinstance(row, list) or len(row) < 8:
            raise ValueError("invalid_share_link")
        if row[1] not in ("w", "o"):
            raise ValueError("invalid_share_link")
        if not CLOCK_RE.fullmatch(str(row[3])) or not CLOCK_RE.fullmatch(str(row[4])):
            raise ValueError("invalid_share_link")
        offset = int(row[5])
        if isinstance(row[5], bool) or not 0 <= offset <= 7:
            raise ValueError("invalid_share_link")
        presets.append({
            "id": str(row[0]),
            "kind": "off" if row[1] == "o" else "work",
            "name": str(row[2]),
            "start": str(row[3]),
            "end": str(row[4]),
            "endDayOffset": offset,
            "tone": str(row[6]),
            "visibleOnHome": row[7] != 0,
        })

    return {
        "v": 1,
        "type": "sloop-cycle-share",
        "plan": plan,
        "presets": presets,
    }
```

生产代码还应验证：

- 每个 `start`、`end` 是否匹配 `CLOCK_RE`。
- `endDayOffset` 是否为 0 到 7 的整数。
- 周期是否非空。
- `todayIndex` 是否在数组范围内。
- 时区和锚点日期是否有效。

### 6.6 Node.js 解码示例

```js
import zlib from "node:zlib";

const MAX_TOKEN_LENGTH = 20_000;
const MAX_DECODED_BYTES = 100_000;

function extractToken(input) {
  const value = String(input ?? "").trim();
  if (!value || value.length > 24_000) {
    throw new Error("invalid_share_link");
  }
  if (/^[A-Za-z0-9_.-]+$/.test(value)) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("invalid_share_link");
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const token = hash.get("share") ?? url.searchParams.get("share");
  if (token && /^[A-Za-z0-9_.-]+$/.test(token)) return token;
  throw new Error("invalid_share_link");
}

export function decodeShareToken(input) {
  const token = extractToken(input);
  if (!token.startsWith("z.") || token.length > MAX_TOKEN_LENGTH) {
    throw new Error("invalid_share_link");
  }

  const encoded = token.slice(2);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error("invalid_share_link");
  }
  const bytes = Buffer.from(encoded, "base64url");
  const raw = zlib.inflateRawSync(bytes, { maxOutputLength: MAX_DECODED_BYTES });
  const wire = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));

  if (!Array.isArray(wire) || wire[0] !== 1) {
    throw new Error("invalid_share_link");
  }
  if (!wire[1] || typeof wire[1] !== "object" || !Array.isArray(wire[2])) {
    throw new Error("invalid_share_link");
  }

  const presets = wire[2].map((row) => {
    if (!Array.isArray(row) || row.length < 8) {
      throw new Error("invalid_share_link");
    }
    if (row[1] !== "w" && row[1] !== "o") {
      throw new Error("invalid_share_link");
    }
    if (
      !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(row[3])) ||
      !/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(String(row[4]))
    ) {
      throw new Error("invalid_share_link");
    }
    const endDayOffset = Number(row[5]);
    if (!Number.isInteger(endDayOffset) || endDayOffset < 0 || endDayOffset > 7) {
      throw new Error("invalid_share_link");
    }
    return {
      id: String(row[0] ?? ""),
      kind: row[1] === "o" ? "off" : "work",
      name: String(row[2] ?? ""),
      start: String(row[3] ?? ""),
      end: String(row[4] ?? ""),
      endDayOffset,
      tone: String(row[6] ?? "sky"),
      visibleOnHome: row[7] !== 0
    };
  });

  return {
    v: 1,
    type: "sloop-cycle-share",
    plan: wire[1],
    presets
  };
}
```

浏览器端也可以使用 `DecompressionStream("deflate-raw")`，但不能跳过解压后上限检查。浏览器实现细节见 `public/cycle-share.js`。

### 6.7 反向生成 token

若外部软件要把周期重新交给 Sloop：

1. 生成展开或紧凑 `plan`。
2. 生成引用到的 `presets`。
3. 构造 `[1, plan, presetTuples]`。
4. UTF-8 JSON 编码。
5. 使用 raw DEFLATE 压缩。
6. 使用无填充 base64url。
7. 加 `z.` 前缀。
8. 控制 token 在 20,000 字符内。
9. 拼成 `https://<sloop-host>/#share=<token>`。

当前 Sloop 导入器明确拒绝把未压缩的 JSON 直接当作分享链接，也拒绝旧式“JSON 直接 base64”的 token。

### 6.8 分享载荷不提供安全保证

`z.*` 只表示压缩，不表示认证或加密：

- 没有 HMAC 签名。
- 没有密码保护。
- 任何人拿到 token 都能解压并读取内容。
- 修改 token 后有可能构造出另一份合法数据包。

因此分享前必须确认是否包含班次备注。备注中不应放置密码、门禁口令、客户资料、患者信息或其他敏感信息。

## 7. 周期展开为真实日期

### 7.1 锚点公式

给定：

- `anchorDate`：锚点对应的本地日期。
- `todayIndex`：锚点在周期数组中的下标。
- `date`：要查询的本地日期。
- `cycle.length`：周期长度。

对应下标为：

```text
dayDelta = daysBetween(anchorDate, date)
cycleIndex = positiveMod(todayIndex + dayDelta, cycle.length)
```

`positiveMod` 必须把负数结果转回非负范围。例如 JavaScript 的 `%` 对负数会保留负号：

```js
function positiveMod(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}
```

`daysBetween` 应按本地日历日期相减，而不是按 UTC 毫秒数除以 86,400,000。夏令时切换日会造成 23 或 25 小时，直接用毫秒相除可能得到错误天数。

### 7.2 展开示例

使用第 5 节示例：

- `anchorDate = 2026-10-21`
- `todayIndex = 1`
- 周期有 4 项

| 本地日期 | 与锚点差 | 计算下标 | 班次 |
| --- | ---: | ---: | --- |
| 2026-10-20 | -1 | `(1-1) mod 4 = 0` | 白班 |
| 2026-10-21 | 0 | `(1+0) mod 4 = 1` | 夜班 |
| 2026-10-22 | +1 | `(1+1) mod 4 = 2` | 休息 |
| 2026-10-23 | +2 | `(1+2) mod 4 = 3` | 24 小时值班 |
| 2026-10-24 | +3 | `(1+3) mod 4 = 0` | 白班 |
| 2026-10-25 | +4 | `(1+4) mod 4 = 1` | 夜班 |

历史日期不需要单独反转数组。公式中的负偏移已经会让周期向前回绕，例如锚点前一天的索引从 1 回到 0。

### 7.3 `backwardCycle` 的作用

`backwardCycle` 只控制 `.ics` 是否生成锚点之前的一段时间，不改变周期公式，也不是“把数组倒过来保存”。

当前 Sloop 的范围规则：

```text
rangeStart = backwardCycle
  ? addMonths(anchorDate, -backwardMonths)
  : anchorDate

rangeEnd = addMonths(anchorDate, durationMonths)
```

展开时从 `rangeStart` 开始，到 `rangeEnd` 之前结束。`rangeEnd` 当天不包含在结果中。

例如：

- `anchorDate=2026-10-21`
- `backwardCycle=true`
- `backwardMonths=3`
- `durationMonths=12`

范围是 `2026-07-21` 到 `2027-10-21`，但不包含 `2027-10-21`。

### 7.4 月份加减

`addMonths` 不应直接使用固定天数。推荐：

1. 保留原日期的“日”。
2. 前进或后退指定月数。
3. 如果目标月份没有这一天，则夹到该月最后一天。

示例：

```text
2026-01-31 + 1 month = 2026-02-28
2026-03-31 - 1 month = 2026-02-28
2024-01-31 + 1 month = 2024-02-29
```

### 7.5 计算事件起止时间

对每个展开后的日期 `D` 和周期项 `S`：

1. 把 `D` 当作 `plan.timezone` 中的本地日历日。
2. 把 `S.start` 解释为该日期的本地墙钟时间。
3. 把 `D + S.endDayOffset` 当作结束日。
4. 把 `S.end` 解释为结束日的本地墙钟时间。
5. 使用 IANA 时区规则转换为 UTC 或目标软件可理解的时间点。

伪代码：

```text
endDate = addCalendarDays(date, shift.endDayOffset)
startLocal = date at shift.start in plan.timezone
endLocal = endDate at shift.end in plan.timezone
```

不要让 `endDate` 通过 `startInstant + durationMinutes` 直接得到。跨夏令时时，实际经过的时长会发生变化，而周期语义是“结束日的本地墙钟时间”。

例如 `America/New_York` 中一个 `20:00 -> 08:00, endDayOffset=1` 的班次：

- 普通日期实际经过 12 小时。
- 春季进入夏令时的夜晚可能少 1 小时。
- 秋季退出夏令时的夜晚可能多 1 小时。

接收方必须使用带 IANA 数据库的日期库，例如 Go 的 `time.LoadLocation`、Python 的 `zoneinfo`、JavaScript 的 Temporal 或等价实现。

### 7.6 不存在的本地时间和重复的本地时间

夏令时切换会造成两类特殊墙钟时间：

- 跳过的时间：例如 02:30 可能不存在。
- 重复的时间：例如 01:30 可能出现两次。

不同日历库对这两种情况的默认选择可能不同。建议独立接收方采用并记录以下默认策略：

- 不存在的本地时间：按跳过的时长向后顺延到第一个有效时刻。例如 02:30 不存在且跳过了 1 小时，按 03:30 处理。
- 重复的本地时间：默认选择第一次出现，除非业务明确要求第二次。

这两个选择是跨系统适配建议，不编码在 wire v1 中。若要求与当前 Sloop 的 UTC 时刻逐秒一致，应移植 `internal/calendar/ics.go` 中的本地时间转换算法，并固定 IANA 时区数据库版本。

### 7.7 当前 Sloop 的锚点行为

这是跨系统接入最容易出错的地方：

- 周期数据中的 `todayIndex` 是位置，不是日期。
- 当前分享载荷默认不包含 `anchorDate`。
- 当前单周期订阅生成 `.ics` 时，会把请求当天在 `plan.timezone` 中的本地日期当作锚点日期。
- 如果只在分享链接中保留 `todayIndex`，明天重新解析时就必须重新决定“哪个日期对应这个下标”。

因此：

| 场景 | 推荐做法 |
| --- | --- |
| 只展示模板顺序 | 可以只使用 `todayIndex` |
| 生成连续日历事件 | 必须固定 `anchorDate` |
| 两个系统同步 | `anchorDate + todayIndex + timezone` 一起保存 |
| 修改周期顺序 | 明确锚点是否随编辑移动；不要隐式重算历史 |

Sloop 当前会忽略 `plan.anchorDate`，所以它适合作为外部快照的附加元数据，但不能依赖 Sloop 在再次保存后继续保留它。需要长期相位稳定的集成应在自己的数据库中保存该日期。

## 8. `.ics` 日历导出

### 8.1 标准与编码

Sloop 当前生成 RFC 5545 iCalendar 文本：

- `Content-Type: text/calendar; charset=utf-8`
- 行尾使用 CRLF。
- 文本属性按 RFC 5545 转义反斜杠、逗号、分号和换行。
- 内容行按 75 个 UTF-8 字节折行，续行以空格开头。
- 文件被标记为 `inline` 或 `attachment`，具体取决于是否存在 `download=1`。

外部系统应使用成熟的 iCalendar 解析库，不要用简单正则逐行读取，否则容易在折行、转义和 UTF-8 多字节字符上出错。

### 8.2 日历级字段

单周期日历包含：

```text
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Sloop//Shift Cycle Calendar//ZH-CN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:<周期标题>
X-WR-TIMEZONE:<IANA 时区>
X-WR-CALDESC:<生成范围和说明>
REFRESH-INTERVAL;VALUE=DURATION:PT1H
X-PUBLISHED-TTL:PT1H
X-SLOOP-TODAY-INDEX:<todayIndex + 1>
...
END:VCALENDAR
```

注意：

- `X-WR-TIMEZONE` 是提示字段，不是所有客户端都严格使用。
- Sloop 的定时事件已经转换成 UTC，因此事件本身不依赖客户端是否支持该扩展字段。
- `X-SLOOP-TODAY-INDEX` 是 **1 开始**，而 JSON 中的 `todayIndex` 是 **0 开始**。
- `REFRESH-INTERVAL` 和 `X-PUBLISHED-TTL` 只是建议，日历客户端可能忽略。

### 8.3 事件级字段

每个事件包含：

| 属性 | 说明 |
| --- | --- |
| `UID` | 稳定的事件标识，见 8.5 |
| `DTSTAMP` | 生成时间 |
| `LAST-MODIFIED` | 生成时间 |
| `SEQUENCE` | 当前固定为 0 |
| `SUMMARY` | 默认为班次名称；`note` 模式下改为备注 |
| `DESCRIPTION` | 包含“周期第 N 天”和标题；`full` 模式下追加备注 |
| `CATEGORIES` | 周期标题 |
| `X-SLOOP-CYCLE-DAY` | 当前周期位置，1 开始 |
| `X-SLOOP-END-DAY-OFFSET` | 结束日偏移 |
| `DTSTART` / `DTEND` | 起止时间 |
| `TRANSP` | 工作班次为 `OPAQUE`，休息为 `TRANSPARENT` |
| `COLOR` | 对应颜色的十六进制值 |

样例：

```text
BEGIN:VEVENT
UID:sloop-20261021-1abc2de@shift-cycle.ics
DTSTAMP:20261021T020000Z
LAST-MODIFIED:20261021T020000Z
SEQUENCE:0
SUMMARY:夜班
DESCRIPTION:周期第 2 天 · 四班轮转
CATEGORIES:四班轮转
X-SLOOP-CYCLE-DAY:2
X-SLOOP-END-DAY-OFFSET:1
DTSTART:20261021T120000Z
DTEND:20261022T000000Z
TRANSP:OPAQUE
COLOR:#5665df
END:VEVENT
```

`X-SLOOP-CYCLE-DAY:2` 对应 JSON 的数组下标 `1`。如果其他系统需要把事件反查回周期位置，应减去 1。

### 8.4 全天休息与定时休息

普通全天休息：

```text
DTSTART;VALUE=DATE:20261022
DTEND;VALUE=DATE:20261023
TRANSP:TRANSPARENT
```

iCalendar 的 `DTEND;VALUE=DATE` 是排他的，所以上面表示只占 2026-10-22 这一天。

定时休息会像工作班次一样使用具体的 UTC `DTSTART` 和 `DTEND`，但保留 `TRANSP:TRANSPARENT`。

特殊修剪规则：

- 前提：当前周期项是全天休息。
- 前一个周期项是工作班次。
- 前一个工作班次的 `endDayOffset=1`。

此时休息事件从上一班次结束时刻开始，到当天 24:00 结束。例如夜班结束于 08:00，则当天全天休息在 ICS 中实际表示 08:00 到 24:00。这样可避免与夜班已经占用的 00:00 到 08:00 重叠。

如果前一个班次是多日班次且 `endDayOffset>1`，Sloop 当前不会应用这条单夜修剪规则。接收方在这些场景应保留原始重叠，不要自行猜测。

### 8.5 UID 与去重

单周期 UID 结构：

```text
sloop-<事件本地日期>-<短哈希>@shift-cycle.ics
```

短哈希由以下内容计算：

```text
UIDNamespace | cycleIndex | shift.name | start | end | endDayOffset | tone
```

单周期下载没有额外命名空间时，`UIDNamespace` 为空。合并日历时，Sloop 使用分享 slug 作为命名空间，避免不同周期的同一天同班次发生 UID 冲突。

注意事项：

- 该哈希是短的非加密稳定摘要，不是安全签名。
- 不要根据 UID 反推原始周期。
- 如果同时导入多份独立导出的 `.ics`，不同周期可能在同一天、同一班次上产生相同 UID。导入方应决定是否加自己的来源命名空间。
- 修改班次名称、时间、结束日偏移或颜色可能改变 UID；日历客户端可能因此把事件视为“旧事件删除 + 新事件新增”。

### 8.6 内容模式

服务端支持三种订阅内容模式：

| 模式 | 查询值 | 行为 |
| --- | --- | --- |
| 班次 + 备注 | `full` 或空 | 事件标题为班次名，描述中包含备注 |
| 仅班次 | `shift` | 事件标题为班次名，不输出备注 |
| 仅备注 | `note` | 只输出有备注的班次，标题为备注内容 |

休息事件仍受 `includeRest` 控制。即使使用 `note` 模式，如果休息事件被过滤，休息备注也不会出现。

“仅班次”不是“只导出工作班次”。它表示不展示备注；若 `includeRest=true`，休息事件仍可能被包含。

### 8.7 导入与订阅

两种使用方式不同：

| 方式 | 行为 |
| --- | --- |
| 下载后导入 | 复制当前有限事件到日历；服务端后续修改不会自动同步 |
| HTTPS / `webcal:` 订阅 | 日历客户端定期拉取同一地址，服务端修改后可更新事件 |

订阅模式下：

- 保存周期的签名地址保持稳定。
- 修改周期内容后，客户端下次刷新可看到新事件。
- 停用账号或删除周期后，地址会失效。
- 订阅地址是访问凭据，不应公开贴出或写入可公开访问的日志。

### 8.8 ICS 不是周期备份

不要尝试只凭 `.ics` 恢复周期模板，原因包括：

- 事件已经展开成具体日期。
- 休息事件可能因为 `includeRest=false` 被省略。
- 备注可能因为内容模式被省略。
- 多日事件、重叠事件和跨夜休息已经被转换成日期时间。
- 没有标准字段保存原始 `cycle` 数组。
- 有限窗口外的历史相位可能不可见。

如果另一个系统既要显示日历，又要保留模板，应同时保存 JSON 和一份参考 `.ics`。

## 9. 其他软件适配指南

### 9.1 适配决策树

```text
目标软件需要的是“日期事件”还是“周期模板”？

日期事件
  -> 只需要日历时：使用 .ics
  -> 需要数据库/表格时：从 JSON 展开成有限事件行

周期模板
  -> Sloop 之间传递：使用 z.* 分享 token
  -> 自建软件：使用展开 JSON + anchorDate
  -> 不支持结构化的旧软件：导出展开后的 CSV，同时保留 JSON 源文件
```

### 9.2 目标软件适配表

| 目标 | 推荐输入 | 需要特别处理 |
| --- | --- | --- |
| Google Calendar | `.ics` 导入或订阅 URL | 可能忽略自定义颜色和部分 `X-` 字段 |
| Apple Calendar | `.ics` 或 `webcal:` | 全天事件、透明状态和订阅刷新策略应以实际客户端为准 |
| Outlook | `.ics` 导入 | 可能不支持 `webcal:`、自定义颜色或某些 `X-` 字段 |
| Excel / 在线表格 | 展开后的 CSV / XLSX | 不要把循环数组直接塞进一个单元格；防 CSV 公式注入 |
| 自建排班系统 | 展开 JSON + `anchorDate` | 保留时区、结束日偏移和周期数组 |
| BI / 数据仓库 | 事件事实表 | 同时保存周期维度和展开事件，避免丢失模板 |
| 其他日历 API | 周期 JSON 转各平台事件对象 | 使用每个平台自己的时区规则和唯一 ID |
| 打印 / 值班表 | 展开事件表 | 按本地日期分组，明确跨夜归属日 |

### 9.3 通用事件映射

从周期项生成事件时，至少保留：

| 目标字段 | Sloop 来源 |
| --- | --- |
| 模板 ID | 由接入方自己生成 |
| 周期位置 | 数组下标 |
| 锚点日期 | `plan.anchorDate` |
| 时区 | `plan.timezone` |
| 事件日期 | 根据第 7 节公式计算 |
| 开始时间 | `shift.start` |
| 结束日期 | 事件日期 + `shift.endDayOffset` |
| 结束时间 | `shift.end` |
| 类型 | `shift.kind` |
| 名称 | `shift.name` |
| 备注 | `shift.note` |
| 颜色 | `shift.tone` |

如果目标系统只支持全天的开始和结束日期，不应假装支持精确到分钟的跨夜班。应明确降级策略，例如：

- 把事件拆分到两个本地日期。
- 保留开始日期，把跨夜信息放入备注。
- 使用平台的“跨夜事件”或“时间区间”能力。
- 拒绝导入并提示需要更强的事件模型。

### 9.4 导入到 Sloop 时的相位调整

其他系统生成 Sloop 分享 token 时，要特别注意当前 Sloop 的锚点解释：

- 当前 Sloop 把 `todayIndex` 当作“今天对应的周期位置”。
- 它不读取 `anchorDate` 来决定相位。
- 如果原始周期在 2026-10-21 的锚点是下标 1，但用户在 2026-10-24 导入，不能直接把 `todayIndex=1` 当作可保留历史的锚点。
- 应先按原 `anchorDate` 计算导入当天的实际下标，再把该下标写入 `todayIndex`。
- 这里的“导入当天”必须取 `plan.timezone` 中的本地日期，而不是用户浏览器时区、服务器 UTC 日期或操作系统本地日期。

公式仍然是：

```text
importIndex = positiveMod(
  originalTodayIndex + daysBetween(originalAnchorDate, importDate),
  cycle.length
)
```

生成 token 后，建议：

1. 立即在 Sloop 中导入验证当天班次。
2. 将原始 `anchorDate` 和 `originalTodayIndex` 保存在源系统。
3. 不要期望 Sloop 再次导出时仍保留原始 `anchorDate`。

### 9.5 Excel / CSV 适配

如果用户要求“导出到 Excel”，不要直接导出循环 JSON 的一行式表格。应先按日期窗口展开：

| 列 | 示例 |
| --- | --- |
| `date` | `2026-10-21` |
| `timezone` | `Asia/Shanghai` |
| `cycle_index` | `2` |
| `shift_kind` | `work` |
| `shift_name` | `夜班` |
| `start_local` | `2026-10-21T20:00:00+08:00` |
| `end_local` | `2026-10-22T08:00:00+08:00` |
| `end_day_offset` | `1` |
| `note` | 空 |

注意：

- 时间应以 ISO 8601 带偏移格式输出，并同时保留时区名。
- 表头和数据使用 UTF-8。
- 如果目标 Excel 对 UTF-8 CSV 识别不佳，可以生成 XLSX，或在 CSV 前加 UTF-8 BOM；但要先验证目标环境。
- 不要把用户可控的标题、名称、备注直接写成以 `=`, `+`, `-`, `@` 开头的单元格，以免 CSV 公式注入。可统一作为文本写入，或在必要时加前导单引号。
- `end_local` 跨夜时，日期可能比 `date` 晚一天或更多。

### 9.6 服务端接入建议

如果由自建服务提供周期导出，建议设置：

| 项目 | 建议 |
| --- | --- |
| 文件类型 | `application/json; charset=utf-8` |
| 文件后缀 | `.sloop-cycle.json` |
| 字符集 | UTF-8 |
| 版本 | 顶层 `v=1`，不支持的版本明确报错 |
| 缓存 | 有版本号或 ETag 时允许缓存；无版本号时避免长期缓存 |
| 下载头 | `Content-Disposition: attachment` |
| 安全头 | `X-Content-Type-Options: nosniff` |
| 日志 | 不记录完整分享 token 或用户备注 |

如果返回的是 `.ics`，继续使用 `text/calendar; charset=utf-8`，不要把 JSON 伪装成 `.ics` 扩展名。

### 9.7 不要依赖的接口

以下内容适合本仓库内部开发，不应作为第三方稳定接口：

- SQLite 数据库文件中的 `calendars.plan_json` 列。
- 需要登录 Cookie 的 `/api/calendars` 响应结构。
- 前端 DOM 元素 ID。
- 分享 token 中未写入本文契约的额外字段。
- `.ics` 中的自定义 `X-SLOOP-*` 字段被所有客户端保留的假设。

第三方集成应以本文 JSON 契约或标准 `.ics` 为准。如果必须在服务端提供公共 API，应新增版本化 endpoint、稳定媒体类型和错误码，而不是让第三方抓取内部接口。

## 10. 安全、隐私与资源限制

### 10.1 分享 token 是明文能力

`z.*` token 中的内容是压缩后的明文数据，不是加密数据。拿到 token 的人可以：

- 解压并读取周期标题。
- 查看班次名称、时间、颜色和备注。
- 复制后再分享给其他人。

分享界面中的“包含班次备注”应被视为隐私开关。关闭后，当前实现会在生成数据包前删除周期项备注。外部系统实现同类功能时，也应先删除备注再压缩，而不是只在展示层隐藏。

### 10.2 压缩不等于签名

Sloop 的订阅 URL 使用服务端 HMAC-SHA256 签名，但分享 token `z.*` 没有签名。两者不是同一种机制：

| 对象 | 是否签名 | 目的 |
| --- | --- | --- |
| 单周期/合并订阅 URL | 是 | 防止伪造访问路径，支持稳定订阅 |
| `z.*` 分享 token | 否 | 自包含传输周期数据 |

不要因为订阅 URL 有签名，就假设分享 token 也受到同等保护。

### 10.3 解压和解析防护

接收不可信 token 时必须限制：

- 原始输入长度。
- base64 解码后的压缩数据长度。
- 解压输出字节数。
- JSON 嵌套深度、周期项数量和备注总大小。
- 单个请求的解析时间。
- 公共 API 的调用频率。

只检查 token 长度不够，因为短压缩数据也可能解压成很大的内容。不要在未设置上限的循环中持续拼接解压结果。

可作为独立接收方的初始安全阈值：

| 项目 | 建议值 | 说明 |
| --- | ---: | --- |
| 原始 URL / 输入 | 24,000 字符 | 与当前 Sloop 一致 |
| `z.*` token | 20,000 字符 | 与当前 Sloop 一致 |
| 解压后 JSON | 100,000 字节 | 与当前 Sloop 一致 |
| JSON 嵌套深度 | 16 | 防止异常嵌套 |
| 周期项数量 | 4,096 | 接收方防护值，不是 wire 语义 |
| 预设数量 | 4,096 | 接收方防护值，不是 wire 语义 |
| 全部备注合计 | 100,000 字节 | 包含 UTF-8 字节数 |
| 单次解析超时 | 2 秒 | 用于服务端请求 |
| 公共接口频率 | 60 次/分钟/客户端 | 按部署规模调整 |

这些是防护建议，不是数据格式限制。收紧阈值时应在错误响应中返回稳定错误码，并说明是“格式不支持”还是“资源超限”。

### 10.4 文本和注入防护

文本字段可能包含：

- HTML 或脚本片段。
- SQL 特殊字符。
- 逗号、分号、反斜杠。
- 回车换行。
- CSV 公式前缀。
- 超长 Unicode 文本或不可见控制字符。

接收方应根据输出上下文转义：

| 输出 | 防护 |
| --- | --- |
| HTML | HTML 转义，避免 `innerHTML` 直接插入 |
| SQL | 参数化查询 |
| iCalendar | RFC 5545 文本转义，禁止原始 CRLF 注入属性 |
| CSV | 正确的字段引号转义和公式注入防护 |
| 日志 | 控制字符清洗，避免日志伪造 |
| 文件路径 | 不直接使用用户标题作路径 |

Sloop 服务端会清洗标题、名称和备注中的 CR/LF/TAB，但外部工具不能假设所有输入都来自 Sloop 服务端。

### 10.5 URL 与日志

分享数据通常放在 URL fragment：

```text
https://sloop.example/#share=z....
```

浏览器不会把 fragment 发送给服务端，但仍可能出现在：

- 浏览器历史记录。
- 截图和剪贴板。
- 聊天工具预览。
- 前端错误日志。
- 第三方脚本读取的当前 URL。

查询参数形式 `?share=` 更容易进入服务器访问日志。生产环境应避免记录完整 URL，或在日志中屏蔽 `share` 参数。

### 10.6 订阅链接保护

订阅 URL 应视为访问凭据：

- 不公开索引。
- 不写入公开 README、工单或聊天记录。
- 不在 CDN 公共缓存中缓存。
- 更换或泄露后应能通过账号停用、周期删除或密钥轮换撤销。

当前 Sloop 对订阅响应设置私有缓存、`noindex` 和 `no-referrer`，但这不能替代用户自身的保密行为。

### 10.7 服务器拉取外部日历

如果其他软件需要从 URL 拉取 `.ics` 或 JSON，必须防止 SSRF：

- 限制协议为 HTTPS。
- 拒绝内网、回环、链路本地和云元数据地址。
- 限制重定向次数。
- 限制响应大小和超时。
- 不把用户提供的 URL 直接交给未校验的 HTTP 客户端。

本文只定义导出和解析格式，不要求任何服务端抓取行为。

### 10.8 最小化数据

导出前建议按用途裁剪：

- 只给日历时，关闭备注或使用“仅班次”。
- 只给排班模板时，不包含无关预设。
- 不包含用户账号、内部数据库 ID 或签名密钥。
- 分享链接使用完毕后，不要继续在公共位置保留。

## 11. 兼容性与版本演进

### 11.1 三个版本号不是一回事

文档和代码中会出现三个版本概念：

| 名称 | 当前位置 | 当前值 | 作用 |
| --- | --- | ---: | --- |
| wire 版本 | 解压后数组第 0 项 | `1` | 决定预设元组和 wire 数组布局 |
| 分享对象版本 | 解码后对象 `v` | `1` | 决定 `type + plan + presets` 契约 |
| 前端紧凑周期版本 | 紧凑 plan 的 `v` | `2` | 前端保存提示，服务端规范化不依赖 |

修改其中一个不意味着其他两个也要改。实现时应分别判断。

### 11.2 向后兼容原则

新增字段时：

- 优先增加可选字段。
- 接收方忽略不认识的字段比直接拒绝更兼容。
- 不要改变已有字段的类型和单位。
- 不要把 0 开始的索引改成 1 开始。
- 不要改变 `endDayOffset` 的“本地日历日”语义。
- 不要改变 `kind=off` 的全天休息判定规则。

当前 Sloop 的行为：

- wire 版本不为 1 时拒绝解析。
- 分享对象 `v` 不为 1 时拒绝。
- 分享对象 `type` 不为 `sloop-cycle-share` 时拒绝。
- 旧式未压缩 base64 JSON token 被拒绝。
- 未压缩 JSON 分享内容被拒绝。

### 11.3 何时必须升级版本

以下变更应使用新版本，不应悄悄兼容：

- 把时长单位从分钟改为秒。
- 把数组位置改为对象键。
- 改变时间字段的时区解释。
- 改变 `endDayOffset` 的含义。
- 改变预设元组顺序。
- 把可选备注变成必需加密字段。
- 引入新的签名或加密 envelope。

仅在 JSON 中增加可选展示字段，可以保持当前版本。需要接收方改变核心计算方式的变更，应升级 wire 或分享对象版本。

### 11.4 锚点字段的兼容性

`plan.anchorDate` 当前是可选扩展：

- 不包含时，旧接收方仍可读取周期顺序。
- 包含时，旧 Sloop 导入器会忽略它。
- 需要日期稳定性的接收方必须读取它。
- 导出工具应在每次真正生成“可执行日历”时写出它。
- 如果周期被复制到另一个日期窗口，应同时复制原始锚点，不能只保留“今天对应第几项”。

### 11.5 导出工具版本声明

由第三方生成的 JSON 建议携带：

```json
{
  "v": 1,
  "type": "sloop-cycle-share",
  "plan": {
    "anchorDate": "2026-10-21",
    "title": "四班轮转",
    "timezone": "Asia/Shanghai",
    "durationMonths": 12,
    "backwardCycle": false,
    "backwardMonths": 3,
    "todayIndex": 0,
    "includeRest": false,
    "cycle": [
      {
        "kind": "work",
        "name": "白班",
        "start": "08:00",
        "end": "20:00",
        "endDayOffset": 0,
        "tone": "sky",
        "presetId": null
      }
    ]
  },
  "presets": []
}
```

这个对象可以只包含内联班次而不引用预设，因此 `presets` 是空数组。不要在没有文档约定时擅自增加顶层必填字段，因为现有 Sloop 解码器只重建已知顶层字段。扩展元数据若需要随分享 token 往返，放在 `plan` 内更稳妥。

### 11.6 升级验收

每次格式升级至少验证：

1. 新版本导出能被新版本解析。
2. 旧版本遇到新版本时明确拒绝，而不是生成错误日历。
3. 新版本仍能读取旧版本 token。
4. 同一周期在升级前后展开结果一致。
5. 备注、颜色、跨夜和多日班次没有被改名或重排。

## 12. 测试清单

### 12.1 必测数据

至少准备以下测试数据：

| 编号 | 数据 | 期望 |
| --- | --- | --- |
| T1 | 4 项周期，含白班、夜班、全天休息、24 小时班 | 正确还原顺序 |
| T2 | `todayIndex=0` | 锚点日对应数组第 1 项 |
| T3 | `todayIndex=length-1` | 锚点日对应最后一项 |
| T4 | 锚点日之前的日期 | 负数偏移正确回绕 |
| T5 | `20:00 -> 08:00, offset=1` | 结束在次日 08:00 |
| T6 | `09:00 -> 09:00, offset=1` | 24 小时，不是 0 小时 |
| T7 | `09:00 -> 09:00, offset=2` | 48 小时 |
| T8 | `09:00 -> 09:00, offset=0` | 拒绝，持续时间为 0 |
| T9 | `off, 00:00 -> 00:00, offset=0` | 全天休息 |
| T10 | `off, 00:00 -> 00:00, offset=1` | 定时休息，不是全天 |
| T11 | 夜班后接全天休息 | 休息从夜班结束时刻开始 |
| T12 | 长周期，例如 40 项 | 能生成超过 35 天后的班次 |
| T13 | 带中文、emoji、逗号、分号、反斜杠的标题 | 文本不破坏 JSON/ICS |
| T14 | 备注为空、超长、含换行 | 按规则清洗或截断 |
| T15 | 未包含备注的分享 | 备注不出现在 token 数据中 |
| T16 | 未知颜色名 | Sloop 导入器容错降级为 `sky`；规范化导出仍应使用已知颜色 |

### 12.2 锚点和日期测试

使用第 5 节示例验证：

```text
anchorDate 2026-10-21, todayIndex 1, cycle length 4

2026-10-20 -> 白班
2026-10-21 -> 夜班
2026-10-22 -> 休息
2026-10-23 -> 24 小时值班
2026-10-24 -> 白班
```

还要验证：

- 跨月：1 月 31 日前后。
- 跨年：12 月 31 日到次年 1 月。
- 闰年：2 月 29 日前后。
- 锚点在未来和锚点在过去的往返转换。
- `backwardCycle=true` 时历史范围正确。
- `rangeEnd` 当天不被包含。

### 12.3 时区和夏令时测试

至少使用：

- `Asia/Shanghai`：固定偏移场景。
- `America/New_York`：春季和秋季夏令时切换。
- `Europe/London`：不同切换日期。
- `Australia/Sydney`：南半球切换方向。

重点验证：

- 定时事件在切换日的 UTC 起止时间。
- 本地墙钟时间保持不变。
- `endDayOffset` 按本地日历日增加。
- 重复时间和不存在时间不会导致事件丢失。
- 全天的 `DTEND` 仍然排他。

### 12.4 分享 token 测试

自动化测试应覆盖：

1. 合法 token 往返。
2. URL hash 和 query 两种形式。
3. 纯 token 输入。
4. 非 `z.` 前缀拒绝。
5. 非法 base64url 拒绝。
6. gzip/zlib 包装数据拒绝。
7. 截断压缩流拒绝。
8. 超过 100,000 字节的解压输出拒绝。
9. wire 版本不是 1 拒绝。
10. 分享对象 `v` 不是 1 拒绝。
11. `type` 错误拒绝。
12. `presets` 不是数组拒绝。
13. 未压缩 JSON 拒绝。
14. 旧式 base64 JSON token 拒绝。
15. 长周期超过 token 限制时给出明确错误。
16. 相同输入多次解码结果一致。

### 12.5 `.ics` 互操作测试

用至少两个成熟 iCalendar 库解析生成结果，检查：

- 日历名称和时区提示。
- 事件数量。
- `SUMMARY`、`DESCRIPTION`、`CATEGORIES`。
- `DTSTART`、`DTEND`。
- 全天事件结束日期。
- `UID` 唯一性。
- `TRANSP` 和 `COLOR` 是否被忽略但不报错。
- 折行后的中文文本能否还原。

导入手工检查：

| 客户端 | 检查项 |
| --- | --- |
| Google Calendar | 导入、删除、时区显示、全天休息 |
| Apple Calendar | 下载导入、`webcal:`、跨夜事件 |
| Outlook | 导入、备注、透明度、重复导入是否去重 |

客户端之间的颜色和透明表现可能不同。这不属于格式错误，应在适配文档中说明降级行为。

### 12.6 往返测试

完整往返流程：

```text
原始周期
  -> 独立 JSON
  -> z.* token
  -> 解码
  -> 再生成 JSON
  -> 比较规范化后的周期语义
```

比较时必须忽略：

- JSON 字段顺序。
- 空白和缩进。
- 内部使用的 `removable`。
- 输出时临时生成的 UI ID。

比较时必须保留：

- 周期长度和顺序。
- 时区。
- `todayIndex`。
- 锚点日期（若存在）。
- 每个班次的 `kind`、起止时间、结束日偏移、名称、颜色和备注。

### 12.7 本仓库验证命令

当前实现可用以下命令验证：

```bash
node --test test/cycle-share.test.mjs test/shift-time.test.mjs
go test ./internal/calendar
go test ./...
pnpm test:frontend
```

修改格式或 ICS 生成逻辑后，建议执行完整的：

```bash
make check
```

### 12.8 发布前检查

- [ ] JSON 使用展开字段并带 `anchorDate`（需要日期稳定性时）。
- [ ] UTC 偏移按目标时区逐日计算。
- [ ] `todayIndex` 已验证在范围内。
- [ ] `endDayOffset` 已显式写入。
- [ ] 24 小时和 48 小时班次没有被误判为 0 小时。
- [ ] 全天休息和定时休息已区分。
- [ ] 备注已按隐私要求裁剪。
- [ ] `.ics` 已用至少两个日历库解析成功。
- [ ] 分享 token 有解压上限。
- [ ] 接收方不会执行或直接渲染用户文本。

## 13. 常见问题

### 13.1 为什么不能直接把 `.ics` 再导入 Sloop 还原周期？

`.ics` 保存的是具体日期上的事件，而不是原始循环数组。休息过滤、备注模式、窗口范围和跨夜转换都会造成信息损失。

需要可逆交换时使用 JSON 或 `z.*` 分享载荷。

### 13.2 为什么 `09:00 -> 09:00` 有时合法、有时非法？

因为仅凭开始和结束时间无法判断时长：

- `endDayOffset=0`：0 小时，非法。
- `endDayOffset=1`：24 小时，合法。
- `endDayOffset=2`：48 小时，合法。

外部系统不能省略结束日偏移后再猜测“结束时间不大于开始时间就一定是次日”，因为那会错误处理 24 小时班次。

### 13.3 为什么分享链接不是普通 base64 JSON？

当前分享 token 是：

```text
"z." + base64url(deflateRaw(JSON))
```

直接 base64 解码只能得到压缩字节，不是 UTF-8 JSON。必须使用 raw DEFLATE 解压。

### 13.4 为什么其他软件解析出的日期会每天变化？

最常见原因是只保存了 `todayIndex`，没有保存 `anchorDate`。`todayIndex` 只说明“锚点对应第几项”，不说明锚点是哪一天。

正常的“相位每天前进”不是错误：日期增加一天，周期下标也前进一项。真正的问题是接收方每次都把当前日期重新当成 `todayIndex` 对应的锚点，导致昨天算出的历史相位被重置。

另一个原因是把本地墙钟时间错误地按固定 UTC 偏移加减，遇到夏令时就会偏移 1 小时。

### 13.5 分享链接会过期吗？

`z.*` 分享链接是自包含数据，本身没有服务端过期机制；但 Sloop 页面和导入功能仍取决于接收方能否打开该实例。

订阅 URL 不同。它可能因为账号停用、周期删除、签名密钥变更或服务不可用而失效。

### 13.6 分享链接能加密吗？

当前不能。它只做压缩。需要保密时：

- 不导出备注。
- 使用受控渠道传递。
- 在外部系统中重新加密保存。
- 不要把 token 放进公开仓库、可索引页面或日志。

### 13.7 为什么订阅里看不到备注？

检查订阅内容模式：

- `full`：包含班次和备注。
- `shift`：只包含班次，不输出备注。
- `note`：只输出带备注的事件。

还要检查休息项是否被 `includeRest=false` 过滤。

### 13.8 为什么跨夜班的结束日期是次日，但持续时长偶尔不是 12 小时？

因为周期保存的是本地墙钟时间，不是“固定持续分钟数”。夏令时切换当天，实际经过的绝对时长可能变化。业务排班通常关心“次日 08:00 下班”，而不是固定经过 12 小时。

### 13.9 能不能把周期导出成 CSV 给 Excel？

可以，但 CSV 应是由周期展开后的事件表，不是直接把 `cycle` 数组塞进一个单元格。若要保留可再次导入的模板，仍应同时保存 JSON。

### 13.10 其他软件能不能直接导入分享 token？

可以，但需要实现第 6 节的 raw DEFLATE + base64url 解码，并按第 5、7 节校验和展开。只支持 JSON 的软件应先让导出工具生成展开 JSON。

## 14. 参考实现位置

本仓库中与本规范直接相关的实现：

| 文件 | 作用 |
| --- | --- |
| [`public/cycle-share.js`](../public/cycle-share.js) | 分享包构造、压缩、解压、预设匹配 |
| [`public/shift-time.js`](../public/shift-time.js) | 结束日偏移、全天休息、持续分钟计算 |
| [`internal/calendar/plan.go`](../internal/calendar/plan.go) | 周期字段、校验、时区和默认值 |
| [`internal/calendar/ics.go`](../internal/calendar/ics.go) | 日期窗口、周期展开和 RFC 5545 输出 |
| [`public/app.js`](../public/app.js) | 前端紧凑格式、下载、分享和导入流程 |
| [`test/cycle-share.test.mjs`](../test/cycle-share.test.mjs) | 分享链接和预设匹配测试 |
| [`test/shift-time.test.mjs`](../test/shift-time.test.mjs) | 时间计算测试 |
| [`internal/calendar/plan_test.go`](../internal/calendar/plan_test.go) | 周期规范化测试 |
| [`internal/calendar/ics_test.go`](../internal/calendar/ics_test.go) | ICS、跨夜、多日、时区和合并测试 |

相关产品说明：

- [`README.md`](../README.md)
- [`internal/httpapi/calendars.go`](../internal/httpapi/calendars.go)

本文是导出与解析格式说明，不替代各目标软件自己的导入文档。最终上线前，应使用目标软件的真实版本完成一次导入、刷新、删除和重复导入测试。

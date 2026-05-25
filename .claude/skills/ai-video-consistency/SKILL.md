---
name: ai-video-consistency
description: Use when converting this novel into AI image or video assets, including character reference sheets, image prompts, video prompts, storyboard prompts, shot lists, consistent character design, negative prompts, scene visuals, covers, or animation continuity.
---

# AI Video Consistency

Use this skill to turn novel canon into stable visual prompts for image and video generation.

## Source Priority

Read:

1. relevant character file in `01-角色设定/`
2. `01-角色设定/角色外貌描写详细版.md`
3. `01-角色设定/角色AI绘画描述.md`
4. relevant chapter or script scene
5. existing assets in `07-角色图片/`

## Visual Consistency Rules

Every prompt should lock:

- age, ethnicity, face shape, eye color, hair color/style
- body type and height impression
- core outfit colors and silhouette
- signature props
- power aura colors
- mood range
- negative prompt for wrong traits

For video, also lock:

- camera type and shot size
- motion style
- scene lighting
- continuity note for same face/outfit across shots

## Output Formats

For character reference:

```markdown
## 角色锁定要素
## 中文提示词
## English Prompt
## Negative Prompt
## 视频一致性备注
```

For storyboard:

```markdown
| 镜头 | 画面 | 动作 | 提示词重点 | 连续性注意 |
|---|---|---|---|---|
```

## Guardrails

Do not change canon appearance just for visual coolness. If a generated asset conflicts with text canon, say what must be adjusted.

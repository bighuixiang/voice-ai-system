# Repository Guidelines

## Project Structure & Module Organization

This repository is a Chinese fantasy novel and adaptation workspace. Core reference material lives in `00-世界观设定/`, including world rules, cultivation systems, writing guides, and special mechanics. Character files are grouped under `01-角色设定/` by role, such as `主角/`, `双女主/`, `小伙伴/`, `反派/`, and `魔兽/`. Main plot planning is in `02-故事大纲/主线剧情/`; drafted prose is in `03-章节正文/`; script adaptations are in `04-剧本/`; chronology is in `05-事件年表/`; notes are in `06-素材笔记/`; image references are in `07-角色图片/`.

## Build, Test, and Development Commands

There is no software build pipeline, package manifest, or automated test suite in this repository. Use Git and text review commands instead:

- `git status --short`: check pending content changes.
- `git diff -- path/to/file.md`: review edits before committing.
- `git log -5 --pretty=format:"%s"`: inspect recent commit wording.

For consistency checks, manually compare changed chapters against `00-世界观设定/编写指南_完整版.md`, `00-世界观设定/写作风格统一指南.md`, and the relevant character files.

## Coding Style & Naming Conventions

Write Markdown files in UTF-8. Keep headings descriptive, use short paragraphs, and preserve the Chinese narrative voice already established in the project. Prefer numbered or role-based directory placement over creating loose root files. Use clear filenames such as `第4章-章节主题.md`, `角色名-完整版.md`, or `设定主题.md`. Avoid temporary report files unless they capture durable canon decisions.

## Testing Guidelines

Content validation is editorial. Before finalizing changes, verify that new scenes do not conflict with the world background, cultivation levels, timeline, character relationships, or existing chapter continuity. For chapter edits, check both prose in `03-章节正文/` and any matching script file in `04-剧本/` when applicable.

## Commit & Pull Request Guidelines

Recent commits use short Chinese summaries with a `feat:` prefix, for example `feat: 优化剧本` or `feat: 优化第二第三章内容`. Keep commits focused on one content area or revision goal. Pull requests should describe the changed files, summarize plot or canon impacts, mention any timeline or character updates, and include images only when changes affect `07-角色图片/` or visual references.

## Agent-Specific Instructions

Read `CLAUDE.md` before substantial writing edits. Preserve established canon, dialogue habits, and style rules. Do not delete legacy planning files without checking whether their content has already been merged into current world, outline, or chapter documents.

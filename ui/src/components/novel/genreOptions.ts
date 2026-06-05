export const novelGenreOptions = [
  "玄幻",
  "仙侠",
  "奇幻",
  "科幻",
  "都市",
  "悬疑",
  "推理",
  "惊悚",
  "历史",
  "武侠",
  "言情",
  "轻小说",
  "现实",
  "末世",
  "赛博朋克"
];

export function formatGenres(genres: string[]) {
  return genres.join(" / ");
}

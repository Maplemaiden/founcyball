/**
 * 排位段位表（假数据骨架）
 * arena：主页中景球场皮肤 id，对应 CSS [data-arena="..."]
 */
window.FOUNCY_RANKS = [
  { id: "dirt", name: "泥地联赛", arenaName: "泥地球场", arena: "dirt", cupsNeed: 0 },
  { id: "park", name: "社区联赛", arenaName: "社区球场", arena: "park", cupsNeed: 400 },
  { id: "city", name: "城市联赛", arenaName: "城市球场", arena: "city", cupsNeed: 1000 },
  { id: "pro", name: "职业联赛", arenaName: "职业球场", arena: "pro", cupsNeed: 2000 },
  { id: "legend", name: "传奇联赛", arenaName: "传奇球场", arena: "legend", cupsNeed: 4000 },
];

/** 当前假进度：以后可换成存档 / 联网 */
window.FOUNCY_RANK_FAKE = {
  rankId: "city",
  cups: 1240,
};

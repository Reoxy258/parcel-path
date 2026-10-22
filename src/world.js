export const WIDTH = 720, HEIGHT = 432, ROOM_COUNT = 30;
export const ZONES = [
  { name: '晨露花园', color: '#87ad72', floor: '#e9ebc9', wall: '#a7bd83', sky: '#edf3df', title: '先借一点风，吹开第一扇门' },
  { name: '风车回廊', color: '#d3a15b', floor: '#f1e7c9', wall: '#cbb086', sky: '#fbf0d7', title: '会冲刺的小家伙，先躲再还手' },
  { name: '琉璃温室', color: '#6ba79a', floor: '#dfeddb', wall: '#95b9a7', sky: '#e5f5ee', title: '看清弹道，在空隙里前进' },
  { name: '云上庭院', color: '#879ec4', floor: '#e5ebed', wall: '#a4b9ce', sky: '#edf4fa', title: '钥匙和金币，留给真正想要的宝物' },
  { name: '落日果园', color: '#cb956c', floor: '#f4e2c9', wall: '#c6aa80', sky: '#fff0dd', title: '把沿途的收获，变成自己的战斗方式' },
  { name: '晴空花塔', color: '#ad9bc5', floor: '#ece6e6', wall: '#b7b1cd', sky: '#f6f0fa', title: '最后一道花门，通向晴空' },
];

export const ENEMY_TYPES = {
  fly: { name: '巡风小飞虫', hp: 18, attack: 8, speed: 55, radius: 11, sprite: 'fly', description: '轻快地追逐，绕开再射击' },
  hopper: { name: '蹦蹦芽', hp: 28, attack: 12, speed: 0, radius: 13, sprite: 'hopper', description: '圈内蓄力后跳跃，离开落点圈' },
  mushroom: { name: '喷籽蘑菇', hp: 34, attack: 10, speed: 0, radius: 14, sprite: 'mushroom', description: '停在原地，定时发射三颗种子' },
  spider: { name: '疾跑小蛛', hp: 24, attack: 11, speed: 38, radius: 12, sprite: 'spider', description: '闪光蓄力后沿直线冲来' },
  guardian: { name: '花园守卫', hp: 150, attack: 14, speed: 26, radius: 27, sprite: 'mushroom', description: '散射与追踪交替，留意蓄力光环' },
};

export const RELICS = {
  twin: { name: '双叶飞信', icon: '❧', description: '每次多发一枚飞信，每枚伤害为原本的 78%。', color: '#79a382' },
  swift: { name: '风行羽毛', icon: '➶', description: '移动更快，冲刺冷却缩短；攻击力 +2。', color: '#89adc2' },
  sun: { name: '暖阳徽章', icon: '☀', description: '体力上限 +20，清空战斗房间后恢复 8 点体力。', color: '#d4ad61' },
  pierce: { name: '穿叶书签', icon: '✧', description: '飞信可额外穿透一个敌人；攻击力 +1。', color: '#aa96bb' },
  rapid: { name: '风铃节拍', icon: '♧', description: '射击间隔缩短 15%，体力恢复 15 点。', color: '#b2a366' },
  armor: { name: '苔绒披肩', icon: '◈', description: '护甲 +2，拾取小心心时额外恢复 6 点体力。', color: '#87a78a' },
};

const patterns = [
  [[3,2,'rock'],[11,2,'rock'],[4,6,'crate'],[10,6,'crate'],[5,2,'spikes'],[9,6,'spikes']],
  [[3,2,'rock'],[4,2,'rock'],[10,6,'rock'],[11,6,'rock'],[10,2,'water'],[4,6,'water']],
  [[4,2,'water'],[5,2,'water'],[9,6,'water'],[10,6,'water'],[3,6,'crate'],[11,2,'crate']],
  [[3,3,'rock'],[3,5,'rock'],[11,3,'rock'],[11,5,'rock'],[5,6,'spikes'],[9,2,'spikes']],
  [[4,2,'crate'],[10,2,'crate'],[4,6,'crate'],[10,6,'crate'],[5,5,'spikes'],[9,3,'spikes']],
  [[2,2,'water'],[12,6,'water'],[4,5,'rock'],[10,3,'rock'],[5,2,'spikes'],[9,6,'spikes']],
];
const titles = ['风铃前庭', '守钥花坛', '旅行补给站', '蓝钥宝库', '守卫的花门'];
export const WORLD = Array.from({ length: ROOM_COUNT }, (_, id) => {
  const floor = Math.floor(id / 5), kind = id % 5;
  let layout = kind === 2 ? [] : patterns[(floor + kind) % patterns.length];
  if (kind === 4) layout = [[3,2,'rock'],[11,2,'rock'],[3,6,'crate'],[11,6,'crate'], ...(floor > 1 ? [[5,2,'spikes'],[9,6,'spikes']] : [])];
  if (id === 0) layout = [[4,2,'crate'],[10,6,'crate'],[3,6,'rock'],[11,2,'rock']];
  const obstacles = layout.map(([x,y,type], i) => ({ id: `o${i}`, type, x:x*48+4, y:y*48+4, w:40, h:40 }));
  const types = kind === 2 ? [] : kind === 4 ? ['guardian', ...(floor > 1 ? ['fly'] : [])] :
    id === 0 ? ['fly','fly'] : kind === 1 ? ['hopper','mushroom', ...(floor > 0 ? ['spider'] : [])] :
    kind === 3 ? ['mushroom','spider', ...(floor > 2 ? ['hopper'] : [])] : ['fly', floor > 0 ? 'spider' : 'hopper', ...(floor > 2 ? ['mushroom'] : [])];
  const spawns = [[192,120],[528,312],[528,120],[192,312]];
  const enemies = types.map((type, i) => ({ id:`e${i}`, type, x:type === 'guardian' ? 360 : spawns[i][0], y:type === 'guardian' ? 120 : spawns[i][1] }));
  const base = floor * 5;
  const doors = kind === 0 ? [
    { direction:'north', to:base+1, type:'open', label:'守钥花坛' },
    { direction:'west', to:base+2, type:'open', label:'补给站' },
    { direction:'east', to:base+3, type:'blue', label:'蓝钥宝库' },
    { direction:'south', to:base+4, type:'yellow', label:'层末守卫' },
  ] : [{ direction: ['','south','east','west','north'][kind], to:base, type:'open', label:'返回前庭' }];
  return { id, floor, kind, name:titles[kind], obstacles, enemies, doors };
});

export function doorPosition(direction) {
  return { north:[360,30], east:[690,216], south:[360,402], west:[30,216] }[direction];
}
export function opposite(direction) { return { north:'south', south:'north', east:'west', west:'east' }[direction]; }
export function doorKey(from, to) { return [from,to].sort((a,b)=>a-b).join('-'); }
export function choicesFor(floor) { return [['twin','swift','sun'],['pierce','rapid','armor'],['twin','sun','pierce'],['swift','armor','rapid'],['twin','pierce','sun'],['swift','rapid','armor']][floor]; }

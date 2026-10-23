# 素材来源

## 用户提供的游戏图集

用户指定的《The Binding of Isaac: Rebirth》本地解包资源中，选取以下四张 PNG 原图，原样复制到 assets/sprites/，没有修改图集内容。相关角色、美术与商标权利归原权利人所有；本仓库不对这些第三方素材授予新的使用许可。

| 本项目文件 | 原始相对路径（resources/gfx/） | 运行时使用区域 |
| --- | --- | --- |
| fly.png | monsters/classic/monster_010_fly.png | 顶行两帧 32×32 |
| hopper.png | monsters/classic/monster_044_hopperleaper.png | 顶行正常动作 32×32 |
| mushroom.png | monsters/afterbirthplus/monster_300_mushroomman.png | 顶行两帧 32×32 |
| spider.png | monsters/classic/monster_080_spider.png | 顶行两帧 32×16 |
| isaac.png | characters/costumes/character_001_isaac.png | 头部行 y=0：下 (0,0)、侧 (64,0)、上 (128,0) 各 32×32，含 +32 眨眼帧；身体行走帧：上下朝向 y=32 行 x=0..224 及 (192,0)、(224,0)，侧面朝向 y=64 行 x=0..224 及 y=96 行 x=0、32，各 32×32 |

动画帧尺寸与层叠锚点参考 `001.000_player.anm2`（身体 pivot(16,25) 偏移 +2、头部 pivot(16,28) 偏移 -5，行走每帧 delay=2）。游戏只绘制正常移动／蓄力帧，不使用图集中死亡与血液特效区域。守卫复用放大的蘑菇正常帧，环境与弹幕采用暖色表现。

## 项目绘制的图形

障碍物（六面灰石、立方木箱、圆形涟漪池塘、三角荆棘阵）、商人、补给站货架全部由 Canvas 实时绘制；主角直接使用上表的以撒精灵原图（仅缩放与镜像，不做像素修改）。花园地砖、花门、花环、飞信与粒子同样由 Canvas 绘制。sunlit.svg 为项目绘制的晴空图标。截图由本地运行的实际游戏生成。

生存模式新增的晶石（普通 teal / 精英金 / 守卫赤晶菱形）、环绕叶片（公转花瓣带拖尾）、荆棘光环（金色虚线环）、精英金环与低血量边缘警示，均为 Canvas 实时绘制，不涉及任何外部素材。

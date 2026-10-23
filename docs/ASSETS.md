# 素材来源

## 用户提供的游戏图集

用户指定的《The Binding of Isaac: Rebirth》本地解包资源中，选取以下四张 PNG 原图，原样复制到 assets/sprites/，没有修改图集内容。相关角色、美术与商标权利归原权利人所有；本仓库不对这些第三方素材授予新的使用许可。

| 本项目文件 | 原始相对路径（resources/gfx/） | 运行时使用区域 |
| --- | --- | --- |
| fly.png | monsters/classic/monster_010_fly.png | 顶行两帧 32×32 |
| hopper.png | monsters/classic/monster_044_hopperleaper.png | 顶行正常动作 32×32 |
| mushroom.png | monsters/afterbirthplus/monster_300_mushroomman.png | 顶行两帧 32×32 |
| spider.png | monsters/classic/monster_080_spider.png | 顶行两帧 32×16 |

动画帧尺寸参考同目录 ANM2 文件。游戏只绘制正常移动／蓄力帧，不使用图集中死亡与血液特效区域。守卫复用放大的蘑菇正常帧，环境与弹幕采用暖色表现。

## 项目绘制的图形

主角小旅行家（草帽、红围巾、小背包）与障碍物（六面灰石、立方木箱、圆形涟漪池塘、三角荆棘阵）、商人、补给站货架全部由 Canvas 实时绘制，不再使用 courier.svg（该文件保留在仓库中供旧版推箱谜题使用）。花园地砖、花门、花环、飞信与粒子同样由 Canvas 绘制。sunlit.svg 为项目绘制的晴空图标。截图由本地运行的实际游戏生成。

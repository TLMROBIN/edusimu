# PhET 非物理可导入清单

- 生成时间：2026-03-14 13:57:12 CST
- 官网元数据：`https://phet.colorado.edu/services/metadata/1.3/simulations?format=json&summary&includePrototypes`
- Partner 元数据：`/tmp/phet_partner_simulations.json`
- 统计口径：仅统计官方 HTML、非 prototype 课件。
- 去重口径：按实际 PhET project 与当前系统已存在课件比对；系统里已存在同内容的，不再算作新增候选。

## 1. 系统准备情况

| PhET 学科 | 系统学科 | subject_id | 教材节点数 | 状态 |
| --- | --- | --- | --- | --- |
| Math & Statistics | math | 2 | 99 | 可导入 |
| Chemistry | chemistry | 5 | 85 | 可导入 |
| Earth & Space | geography | 7 | 0 | 需先补教材目录 |
| Biology | biology | 6 | 108 | 可导入 |

说明：`Earth & Space` 在当前系统里只能暂挂到 `geography`，但现在还没有教材目录，暂时不适合直接批量导入。

## 2. 汇总

| PhET 学科 | 官网 HTML 数 | 系统已存在 | 新增候选 | 系统学科 | 教材节点数 |
| --- | --- | --- | --- | --- | --- |
| Math & Statistics | 51 | 14 | 37 | math | 99 |
| Chemistry | 34 | 20 | 14 | chemistry | 85 |
| Earth & Space | 19 | 17 | 2 | geography | 0 |
| Biology | 8 | 2 | 6 | biology | 108 |

- 非物理唯一新增候选总数：`55`
- 详细 CSV：
  - `docs/generated/phet_non_physics_unique_candidates.csv`
  - `docs/generated/phet_math_statistics_catalog.csv`
  - `docs/generated/phet_chemistry_catalog.csv`
  - `docs/generated/phet_earth_and_space_catalog.csv`
  - `docs/generated/phet_biology_catalog.csv`
  - `docs/generated/phet_non_physics_existing_overlaps.csv`

## 3. 唯一新增候选

| project | 标题 | 官方学科 | 有官方中文 | 推荐 runUrl |
| --- | --- | --- | --- | --- |
| center-and-variability | Center and Variability | Math & Statistics | 否 | /sims/html/center-and-variability/latest/center-and-variability_en.html |
| greenhouse-effect | Greenhouse Effect | Earth & Space | 否 | /sims/html/greenhouse-effect/latest/greenhouse-effect_en.html |
| mean-share-and-balance | Mean: Share and Balance | Math & Statistics | 否 | /sims/html/mean-share-and-balance/latest/mean-share-and-balance_en.html |
| membrane-transport | Membrane Transport | Chemistry,Biology | 否 | /sims/html/membrane-transport/latest/membrane-transport_en.html |
| number-compare | Number Compare | Math & Statistics | 是 | /sims/html/number-compare/latest/number-compare_zh_CN.html |
| number-pairs | Number Pairs | Math & Statistics | 否 | /sims/html/number-pairs/latest/number-pairs_en.html |
| ph-scale | PH值  | Earth & Space,Chemistry,Biology | 是 | /sims/html/ph-scale/latest/ph-scale_zh_CN.html |
| projectile-sampling-distributions | Projectile Sampling Distributions | Math & Statistics | 否 | /sims/html/projectile-sampling-distributions/latest/projectile-sampling-distributions_en.html |
| quadrilateral | Quadrilateral | Math & Statistics | 否 | /sims/html/quadrilateral/latest/quadrilateral_en.html |
| ph-scale-basics | pH值:基础 | Chemistry | 是 | /sims/html/ph-scale-basics/latest/ph-scale-basics_zh_CN.html |
| least-squares-regression | 一次线性函数的拟合 | Math & Statistics | 是 | /sims/html/least-squares-regression/latest/least-squares-regression_zh_CN.html |
| trig-tour | 三角函数之旅 | Math & Statistics | 是 | /sims/html/trig-tour/latest/trig-tour_zh_CN.html |
| graphing-quadratics | 二次函数图像 | Math & Statistics | 是 | /sims/html/graphing-quadratics/latest/graphing-quadratics_zh_CN.html |
| function-builder-basics | 函数构造器:基础 | Math & Statistics | 是 | /sims/html/function-builder-basics/latest/function-builder-basics_zh_CN.html |
| molecule-shapes | 分子形状 | Chemistry | 是 | /sims/html/molecule-shapes/latest/molecule-shapes_zh_CN.html |
| molecule-shapes-basics | 分子形状:基础 | Chemistry | 是 | /sims/html/molecule-shapes-basics/latest/molecule-shapes-basics_zh_CN.html |
| molecule-polarity | 分子极性 | Chemistry,Biology | 是 | /sims/html/molecule-polarity/latest/molecule-polarity_zh_CN.html |
| fraction-matcher | 分数配对 | Math & Statistics | 是 | /sims/html/fraction-matcher/latest/fraction-matcher_zh_CN.html |
| fractions-intro | 分数：入门 | Math & Statistics | 是 | /sims/html/fractions-intro/latest/fractions-intro_zh_CN.html |
| fractions-mixed-numbers | 分数：带分数 | Math & Statistics | 是 | /sims/html/fractions-mixed-numbers/latest/fractions-mixed-numbers_zh_CN.html |
| fractions-equality | 分数：等式 | Math & Statistics | 是 | /sims/html/fractions-equality/latest/fractions-equality_zh_CN.html |
| build-a-molecule | 创造一个分子 | Chemistry | 是 | /sims/html/build-a-molecule/latest/build-a-molecule_zh_CN.html |
| area-builder | 区域建造者 | Math & Statistics | 是 | /sims/html/area-builder/latest/area-builder_zh_CN.html |
| unit-rates | 单位价格 | Math & Statistics | 是 | /sims/html/unit-rates/latest/unit-rates_zh_CN.html |
| reactants-products-and-leftovers | 反应物，生成物及未反应物 | Chemistry | 是 | /sims/html/reactants-products-and-leftovers/latest/reactants-products-and-leftovers_zh_CN.html |
| isotopes-and-atomic-mass | 同位素和原子的质量 | Chemistry | 是 | /sims/html/isotopes-and-atomic-mass/latest/isotopes-and-atomic-mass_zh_CN.html |
| vector-addition-equations | 向量的和：等式 | Math & Statistics | 是 | /sims/html/vector-addition-equations/latest/vector-addition-equations_zh_CN.html |
| arithmetic | 四则运算 | Math & Statistics | 是 | /sims/html/arithmetic/latest/arithmetic_zh_CN.html |
| gene-expression-essentials | 基因表达基础 | Biology | 是 | /sims/html/gene-expression-essentials/latest/gene-expression-essentials_zh_CN.html |
| function-builder | 建立方程 | Math & Statistics | 是 | /sims/html/function-builder/latest/function-builder_zh_CN.html |
| molarity | 摩尔浓度 | Chemistry | 是 | /sims/html/molarity/latest/molarity_zh_CN.html |
| number-play | 数字游戏 | Math & Statistics | 是 | /sims/html/number-play/latest/number-play_zh_CN.html |
| number-line-integers | 数轴：整数 | Math & Statistics | 是 | /sims/html/number-line-integers/latest/number-line-integers_zh_CN.html |
| number-line-distance | 数轴：距离 | Math & Statistics | 是 | /sims/html/number-line-distance/latest/number-line-distance_zh_CN.html |
| number-line-operations | 数轴：运算 | Math & Statistics | 是 | /sims/html/number-line-operations/latest/number-line-operations_zh_CN.html |
| build-a-fraction | 构建一个分数 | Math & Statistics | 是 | /sims/html/build-a-fraction/latest/build-a-fraction_zh_CN.html |
| proportion-playground | 比例游乐场 | Math & Statistics | 是 | /sims/html/proportion-playground/latest/proportion-playground_zh_CN.html |
| beers-law-lab | 比尔定律实验 | Chemistry | 是 | /sims/html/beers-law-lab/latest/beers-law-lab_zh_CN.html |
| ratio-and-proportion | 比率和比例 | Math & Statistics | 是 | /sims/html/ratio-and-proportion/latest/ratio-and-proportion_zh_CN.html |
| concentration | 浓度 | Chemistry | 是 | /sims/html/concentration/latest/concentration_zh_CN.html |
| graphing-lines | 直线图形 | Math & Statistics | 是 | /sims/html/graphing-lines/latest/graphing-lines_zh_CN.html |
| neuron | 神经元 | Biology | 是 | /sims/html/neuron/latest/neuron_zh_CN.html |
| equality-explorer | 等式探索 | Math & Statistics | 是 | /sims/html/equality-explorer/latest/equality-explorer_zh_CN.html |
| equality-explorer-two-variables | 等式探索:两个变量 | Math & Statistics | 是 | /sims/html/equality-explorer-two-variables/latest/equality-explorer-two-variables_zh_CN.html |
| equality-explorer-basics | 等式探索:基础 | Math & Statistics | 是 | /sims/html/equality-explorer-basics/latest/equality-explorer-basics_zh_CN.html |
| graphing-slope-intercept | 绘图:斜率与截距 | Math & Statistics | 是 | /sims/html/graphing-slope-intercept/latest/graphing-slope-intercept_zh_CN.html |
| natural-selection | 自然选择 | Biology | 是 | /sims/html/natural-selection/latest/natural-selection_zh_CN.html |
| make-a-ten | 获得一个10 | Math & Statistics | 是 | /sims/html/make-a-ten/latest/make-a-ten_zh_CN.html |
| expression-exchange | 表达式变换 | Math & Statistics | 是 | /sims/html/expression-exchange/latest/expression-exchange_zh_CN.html |
| balancing-chemical-equations | 配平化学方程式 | Chemistry | 是 | /sims/html/balancing-chemical-equations/latest/balancing-chemical-equations_zh_CN.html |
| acid-base-solutions | 酸碱溶液 | Chemistry | 是 | /sims/html/acid-base-solutions/latest/acid-base-solutions_zh_CN.html |
| area-model-multiplication | 面积模型乘法 | Math & Statistics | 是 | /sims/html/area-model-multiplication/latest/area-model-multiplication_zh_CN.html |
| area-model-algebra | 面积模型代数 | Math & Statistics | 是 | /sims/html/area-model-algebra/latest/area-model-algebra_zh_CN.html |
| area-model-introduction | 面积模型入门 | Math & Statistics | 是 | /sims/html/area-model-introduction/latest/area-model-introduction_zh_CN.html |
| area-model-decimals | 面积模型：小数 | Math & Statistics | 是 | /sims/html/area-model-decimals/latest/area-model-decimals_zh_CN.html |

## 4. 官网属于非物理学科但系统里已存在的课件

| project | 标题 | 官方学科 | 现有动画 ID | 现有系统学科 | 现有标题 |
| --- | --- | --- | --- | --- | --- |
| build-a-nucleus | Build a Nucleus | Chemistry,Physics | 17 | physics | PhET 构造原子核 |
| calculus-grapher | Calculus Grapher | Math & Statistics,Physics | 104 | physics | 微积分绘图器 |
| fourier-making-waves | Fourier: Making Waves | Math & Statistics,Chemistry,Physics | 123 | physics | 傅里叶：造波 |
| keplers-laws | Kepler's Laws | Math & Statistics,Earth & Space,Physics | 135 | physics | 开普勒定律 |
| magnet-and-compass | Magnet and Compass | Earth & Space,Physics | 136 | physics | 磁铁和指南针 |
| models-of-the-hydrogen-atom | Models of the Hydrogen Atom | Chemistry,Physics | 140 | physics | 氢原子模型 |
| my-solar-system | My Solar System | Earth & Space,Physics | 142 | physics | 我的太阳系 |
| projectile-data-lab | Projectile Data Lab | Math & Statistics,Physics | 146 | physics | 抛体运动数据实验室 |
| quantum-coin-toss | Quantum Coin Toss | Chemistry,Physics | 148 | physics | 量子抛硬币 |
| quantum-measurement | Quantum Measurement | Chemistry,Physics | 149 | physics | 量子测量 |
| gravity-force-lab | 万有引力实验 | Earth & Space,Physics | 131 | physics | 万有引力实验 |
| plinko-probability | 二项分布弹珠台几率 | Math & Statistics,Physics | 145 | physics | 二项分布弹珠台几率 |
| color-vision | 光的混合 | Biology,Physics | 112 | physics | 光的混合 |
| molecules-and-light | 分子与光 | Earth & Space,Chemistry,Physics | 141 | physics | 分子与光 |
| rutherford-scattering | 卢瑟福散射 | Chemistry,Physics | 151 | physics | 卢瑟福散射 |
| build-an-atom | 原子模型 | Chemistry,Physics | 16 | physics | PhET 构造原子 |
| atomic-interactions | 原子的相互作用 | Chemistry,Physics | 95 | physics | 原子的相互作用 |
| under-pressure | 受到压力 | Earth & Space,Physics | 154 | physics | 受到压力 |
| vector-addition | 向量相加 | Math & Statistics,Physics | 155 | physics | 向量相加 |
| density | 密度 | Earth & Space,Chemistry,Biology,Physics | 115 | physics | 密度 |
| balancing-act | 平衡探究实验 | Math & Statistics,Physics | 96 | physics | 平衡探究实验 |
| coulombs-law | 库仑定律 | Chemistry,Physics | 113 | physics | 库仑定律 |
| gravity-force-lab-basics | 引力实验室：基础 | Earth & Space,Physics | 132 | physics | 引力实验室：基础 |
| diffusion | 扩散 | Earth & Space,Chemistry,Physics | 116 | physics | 扩散 |
| projectile-motion | 斜抛运动 | Math & Statistics,Physics | 10 | physics | PhET 抛体运动 |
| curve-fitting | 曲线拟合 | Math & Statistics,Physics | 114 | physics | 曲线拟合 |
| gases-intro | 气体基础 | Earth & Space,Chemistry,Physics | 126 | physics | 气体基础 |
| gas-properties | 气体性质 | Earth & Space,Chemistry,Physics | 22 | physics | PhET 气体性质 |
| balloons-and-static-electricity | 气球和静电（摩擦起电） | Earth & Space,Chemistry,Physics | 97 | physics | 气球和静电（摩擦起电） |
| waves-intro | 波动入门 | Earth & Space,Physics | 158 | physics | 波动入门 |
| wave-interference | 波的干涉 | Earth & Space,Physics | 11 | physics | PhET 波的干涉 |
| states-of-matter | 物质状态 | Chemistry,Physics | 23 | physics | PhET 物质状态 |
| states-of-matter-basics | 物质状态：基础 | Chemistry,Physics | 153 | physics | 物质状态：基础 |
| resistance-in-a-wire | 电线的电阻 | Math & Statistics,Physics | 150 | physics | 电线的电阻 |
| wave-on-a-string | 绳波 | Math & Statistics,Earth & Space,Chemistry,Physics | 19 | physics | PhET 绳波 |
| energy-forms-and-changes | 能量的形式和转换 | Chemistry,Physics | 117 | physics | 能量的形式和转换 |
| masses-and-springs | 质量和弹簧 | Math & Statistics,Physics | 14 | physics | PhET 弹簧和质量 |
| ohms-law | 部分电路欧姆定律 | Math & Statistics,Physics | 8 | physics | PhET 欧姆定律 |
| gravity-and-orbits | 重力和轨道 | Earth & Space,Physics | 27 | physics | PhET 引力与轨道 |
| pendulum-lab | 钟摆实验 | Math & Statistics,Physics | 144 | physics | 钟摆实验 |
| blackbody-spectrum | 黑体辐射 | Earth & Space,Chemistry,Physics | 26 | physics | PhET 黑体辐射光谱 |

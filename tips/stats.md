# 분석: 통계 검정 · plot 매칭표

## 1. 검정 고르기 전에 정할 세 가지

1. **결과 변수는 어떤 종류?** 연속값(농도, 발현량, 크기) · 개수(count) · 비율/범주(있다/없다, 등급) · 시간-사건(생존, 재발까지 시간)
2. **비교 구조는?** 그룹 몇 개 · 독립인가 짝지었나(같은 대상 전후, 같은 날 같이 한 실험) · 요인 몇 개(유전형 × 처리)
3. **n은 무엇인가?** 생물학적 반복(동물 한 마리, 환자 한 명, 독립적으로 키운 배양 한 번)만 n이에요. 같은 시료를 여러 웰에 나눈 기술적 반복은 평균 내서 1개로 쳐요.

## 2. 상황별 매칭표

| 상황 | 예시 | 검정 (모수) | 비모수 · 대안 | 추천 plot | 보고할 것 |
|---|---|---|---|---|---|
| 두 그룹, 서로 독립 | WT vs KO 발현량 | unpaired t-test (분산 다르면 **Welch** — 기본으로 써도 됨) | Mann–Whitney U | 점 전부 + 평균±SD (dot plot), 또는 box + 점 | 평균 차이와 95% CI, p, 그룹별 n |
| 두 조건, 짝지음 | 같은 환자 치료 전/후, 같은 날 대조·처리 | paired t-test | Wilcoxon signed-rank | before–after plot (짝을 선으로 연결) | 짝 차이의 평균·95% CI, p |
| 세 그룹 이상, 요인 하나 | 대조 · 저용량 · 고용량 | one-way ANOVA → 사후검정 (모두 서로: Tukey, 대조와만: Dunnett) | Kruskal–Wallis → Dunn | dot plot + 평균±SD | F(df), p, 사후검정의 보정된 p |
| 요인 두 개 | 유전형 × 약물 처리 | two-way ANOVA (상호작용 포함) → Šidák / Tukey | 변환 후 ANOVA, aligned rank transform | 묶음 dot plot, 상호작용 plot | 주효과·상호작용 p, 사후검정 |
| 같은 대상을 여러 번 (시간 경과) | 체중 0–8주, 시간별 농도 | repeated-measures ANOVA 또는 **mixed-effects model** (빠진 값 있어도 됨) | Friedman (요인 하나) | 시간을 x축으로 선 그래프 (평균±SD, 개체별 얇은 선 추천) | 시간 × 그룹 상호작용 p |
| 범주형 비율 | 반응/무반응 × 치료군 | chi-square test (기대빈도 5 미만 칸 있으면 **Fisher's exact**) | — | 100% 누적 막대, 개수 표 | 비율, OR 또는 RR과 95% CI, p |
| 두 연속 변수의 관계 | 단백질 발현 vs 종양 크기 | Pearson r (선형·정규) | Spearman ρ (순위, 곡선 관계) | scatter + 회귀선(95% CI 띠) | r(ρ), 95% CI, p, n |
| 다른 변수 보정·예측 | 나이·성별 보정한 효과 | linear regression, ANCOVA | — | scatter + fit, **잔차 plot**(가정 확인) | 계수 β와 95% CI, R² |
| 있다/없다 결과의 위험 요인 | 질환 유무와 여러 요인 | logistic regression | — | forest plot (OR) | OR·95% CI, 보정한 변수 |
| 생존 · 시간-사건 | 전체 생존, 재발까지 시간 | Kaplan–Meier + **log-rank**, 보정하려면 Cox regression | — | KM 곡선 + 아래에 number at risk | 중앙 생존, HR·95% CI, p |
| 용량–반응 | 약물 농도별 세포 생존율 | 비선형 회귀 (4-parameter logistic) | — | x축 log(농도) S자 곡선 + 점 | IC50/EC50와 95% CI |
| 진단 성능 | 바이오마커로 환자 구별 | ROC 분석 | — | ROC curve | AUC·95% CI, 정한 cut-off의 민감도·특이도 |
| 두 측정법이 같은가 | 새 키트 vs 기존 키트 | Bland–Altman, ICC (상관계수만으로는 부족) | — | Bland–Altman plot | bias, limits of agreement |
| 유전자 발현 (RNA-seq count) | 수천 유전자를 두 그룹 비교 | DESeq2 / edgeR (음이항 분포) | limma-voom | volcano, MA plot, heatmap(z-score) | log2 fold change, **FDR(padj)** |
| qPCR 상대 발현 | 처리 후 유전자 발현 변화 | ΔCt 값으로 t-test/ANOVA (2^−ΔΔCt는 그림용) | — | fold change dot plot (log2 축 추천) | 기준(reference) 유전자, 반복 수 |
| 대조군을 1(100%)로 맞춘 비율 | 대조 대비 상대 신호 | 비율의 log에 one-sample t-test(0과 비교) 또는 원래 값으로 paired test | Wilcoxon signed-rank | dot plot (대조 = 1 선) | 정규화 방법 |
| 많은 변수 한눈에 보기 | 시료가 그룹별로 모이나 | PCA (탐색용, 검정 아님) · UMAP/t-SNE (시각화만) | — | PC1–PC2 scatter (축에 설명 분산 %) | 쓴 변수, 전처리 |

## 3. 여러 번 검정할 때 (다중비교)

- 그룹이 셋 이상이면 t-test를 여러 번 하지 말고 ANOVA + 사후검정을 써요.
- 유전자·시간점·부위를 여러 개 검정하면 보정해요. **Bonferroni**(가장 엄격) · **Holm**(Bonferroni보다 덜 엄격, 늘 써도 됨) · **FDR, Benjamini–Hochberg**(오믹스처럼 아주 많을 때).
- 어떤 보정을 했는지 Methods와 legend에 적어요.

## 4. 오차 막대 고르기

| 막대 | 뜻 | 언제 |
|---|---|---|
| **SD** | 데이터가 얼마나 퍼졌나 | 기본 추천. 실제 변동을 보여 줌 |
| **SEM** | 평균을 얼마나 정확히 알았나 (SD/√n) | 짧아 보여서 오해하기 쉬움. 쓰면 꼭 SEM이라고 적기 |
| **95% CI** | 평균이 있을 법한 범위 | 비교·추론에 가장 직관적 |

- n이 작으면(대략 10 이하) 막대만 그리지 말고 **점을 전부** 보여 줘요.
- 연속값을 **평균 막대(bar graph)**로만 그리면 분포가 가려져요. dot plot · box + 점 · violin을 써요. 막대는 개수·비율에 어울려요.

## 5. 가정 확인

- **정규성**: n이 작으면 정규성 검정(Shapiro–Wilk)의 힘이 약해요. 데이터 성격(농도·발현량은 보통 오른쪽 꼬리가 길어서 log 변환)과 Q-Q plot을 같이 봐요.
- **등분산**: 두 그룹이면 Welch t-test가 등분산을 가정하지 않아 안전해요.
- **독립성**: 같은 동물의 여러 세포, 같은 날 실험한 묶음은 독립이 아니에요. 평균 내거나 mixed-effects model로 묶어요.

## 6. 자주 하는 실수

| 실수 | 바르게 |
|---|---|
| 기술적 반복(같은 시료 3웰)을 n=3으로 | 생물학적 반복만 n. 기술적 반복은 평균 |
| 세 그룹을 t-test 세 번 | ANOVA + 사후검정 |
| p만 적고 효과 크기 없음 | 평균 차이·fold change와 95% CI도 |
| p = 0.06을 "경향(trend)이 있다"로 | 미리 정한 기준대로. 효과 크기와 CI로 설명 |
| 이상치를 마음대로 뺌 | 빼는 기준을 미리 정하고 적기, 뺀 것도 보고 |
| 정규화해서 대조가 모두 1인데 그대로 t-test | log 비율로 one-sample test, 또는 원래 값으로 paired |
| 단측 검정을 결과 보고 고름 | 기본은 양측. 단측은 미리 정한 경우만 |

## 7. 그림 legend · Methods에 꼭 적을 것

- n이 무엇인지 (예: "n = 6 mice per group", "3 independent experiments")
- 오차 막대 종류 (SD / SEM / 95% CI)
- 검정 이름, 양측/단측, 사후검정·다중비교 보정
- 정확한 p 값 (p < 0.0001처럼 아주 작을 때만 부등호), 유의 기호(*, **)의 정의
- 쓴 소프트웨어와 버전 (GraphPad Prism 10, R 4.4 등)

## 8. 도구별로 어디서

| 분석 | GraphPad Prism | R | Python |
|---|---|---|---|
| t-test · Mann–Whitney | Column → t tests | `t.test()`, `wilcox.test()` | `scipy.stats.ttest_ind`, `mannwhitneyu` |
| ANOVA + 사후검정 | Column/Grouped → ANOVA | `aov()` + `TukeyHSD()`, `emmeans` | `statsmodels`, `pingouin` |
| mixed-effects | Grouped → Mixed-effects | `lme4`, `lmerTest` | `statsmodels.MixedLM` |
| 생존 | Survival 표 | `survival`, `survminer` | `lifelines` |
| 용량–반응 | XY → Nonlinear regression | `drc` | `scipy.optimize.curve_fit` |
| RNA-seq | — | `DESeq2`, `edgeR` | `pydeseq2` |
| 그래프 | 기본 | `ggplot2` | `matplotlib`, `seaborn` |

> 헷갈리면 실험 전에 이 표에서 검정을 정하고, 랩 미팅에서 한 번 확인받아요.

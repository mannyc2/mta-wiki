---
managed_by: "mta-wiki-materializer"
record_id: "source_meeting-doc-202096"
record_kind: "source"
display_name: "Data & Analytics at the MTA - Board Presentation March 25 2026"
source_id: "meeting_doc_202096"
source_ids:
  - "meeting_doc_202096"
local_observation_id: "source_meeting_doc_202096"
local_observation_ids:
  - "source_meeting_doc_202096"
review_state: "unreviewed"
truth_status: "source_stated"
generated_at: "2026-06-21T22:19:38.927Z"
raw_text: "Presentation to the MTA Board March 25, 2026"
submission_ids:
  - "sub_49095eff8a3fa57b"
payload:
  authority_tier: "board_material"
  content_type: "board presentation"
  date_text: "March 25, 2026"
  date_text_normalized:
    confidence: "parsed_text"
    normalized_date: "2026-03-25"
    precision: "day"
    raw_text: "March 25, 2026"
  document_date: "March 25, 2026"
  document_date_normalized:
    confidence: "parsed_text"
    normalized_date: "2026-03-25"
    precision: "day"
    raw_text: "March 25, 2026"
  published_date_normalized: "2026-03-25"
  published_date_precision: "day"
  title: "Data & Analytics at the MTA"
evidence_refs:
  -
    block_id: "p001_c0002"
    evidence_id: "meeting_doc_202096#p001_c0002"
    page_number: 1
    role: "title_date"
    source_id: "meeting_doc_202096"
    source_path: "raw/sources/meeting_doc_202096/blocks.jsonl"
    text_sha256: "sha256:9caafc3e812051f39adcc921f7e16ba558aaa441ce7893210ca1d9320cf545e8"
    text_source: "raw_text"
---

# Data and analytics board presentation

source_id: meeting_doc_202096
citation: cite block ids exactly as shown in square brackets
document: 86 block(s)

## Page 1

### [p001_c0001] Data & Analytics at the MTA
[p001_c0002] Presentation to the MTA Board March 25, 2026
> [p001_c0003] The MTA logo, featuring the letters "MTA" in white on a black circular background.
> [p001_c0004] A photograph of a modern MTA station interior. The ceiling is a prominent feature, consisting of a grid of illuminated hexagonal shapes in various colors including blue, green, yellow, and red. Below the ceiling, there is a stainless steel escalator with a curved metal railing. The floor is made of grey stone tiles. In the background, there are more structural elements and what appears to be a train platform area.

## Page 2

### [p002_c0001] The MTA maintains hundreds of valuable data sources
[p002_c0002] _Maintenance work orders_
[p002_c0003] _Vehicle locations_
[p002_c0004] _Procurement_
[p002_c0005] _Employee data/ Timekeeping_
[p002_c0006] _Ridership_
> [p002_c0007] The graph shows ridership trends over time. The y-axis represents a percentage from 50% to 90%. The x-axis represents time, with a specific point labeled 'February 20th' and 'McKinsey midpoint'. The graph shows a line with data points, and a label 'Actual Results' is visible near the bottom of the graph.
[p002_c0008] _Budget/ Finance_
[p002_c0009] _2_

## Page 3

### [p003_c0001] But it was not always easy to use our data to inform decisions
[p003_c0002] Is there any documentation?
[p003_c0003] How can I get access?
[p003_c0004] Do we have data on this topic?
[p003_c0005] _MTA Analyst_
[p003_c0006] How can I combine data from different sources?
[p003_c0007] Am I working with this data in the same way as everyone else?
[p003_c0008] I'm getting different reports that tell different stories on the same number.
[p003_c0009] How can I get answers more quickly?
[p003_c0010] _MTA Manager/Executive_
[p003_c0011] I need to dig in on this problem beyond just high-level numbers.
[p003_c0012] _3_

## Page 4

### [p004_c0001] How does MTA Data & Analytics fix this problem?
> [p004_c0002] The diagram illustrates the MTA Data Lake architecture, showing the flow of data from external sources into a central data lake and then to various outputs. Data Sources: OMNY data (Cubic cloud): Represented by three cylinders (purple, yellow, purple) on the left. MetroCard data (internal mainframe): Represented by four cylinders (green, blue, green, red) on the left. MTA Data Lake: A large green cylinder in the center containing the following data processing steps: Copy: Raw data is copied into the lake. OMNY data (raw): The raw OMNY data is copied into the lake. MetroCard data (raw): The raw MetroCard data is copied into the lake. Clean, organize: The raw OMNY data is cleaned and organized into fact_omny_taps . Combine: The fact_omny_taps and fact_metrocard_swipes are combined into fact_rides . Aggregate: The fact_metrocard_swipes and fact_metrocard_sales are combined into fact_rides . Outputs: NYS Open Data: Data is exported to DATA.NY.GOV and Metrics.mta.info . A line graph shows a trend over time. Board books: Data is exported to Board books . A bar chart titled "Subway Ridership" shows monthly ridership from 2023 to 2026, with "Paid" and "Unpaid" categories. Internal dashboards: Data is exported to Internal dashboards . A line chart titled "Weekly Ridership (Last 6 Months)" shows weekly ridership trends.
[p004_c0003] _4_

## Page 5

### [p005_c0001] Recent examples of sharper analytics from this new approach
- [p005_c0002] 1 Jamaica OTP 2 Student OMNY 3 NYCT vending machine uptime 4 Employee availability
[p005_c0003] _5_

## Page 6

### [p006_c0001] In early 2023, satisfaction with the transfer experience was very low
> [p006_c0002] Jamaica Passenger Transfer Satisfaction Satisfaction with transfer experience for passengers changing at Jamaica A bar chart titled 'Jamaica Passenger Transfer Satisfaction' showing satisfaction percentages for three time periods. The y-axis is labeled 'Percent' and ranges from 40% to 70% in 5% increments. The x-axis lists 'Spring 2023', 'Fall 2023', and 'Spring 2024'. The bars show satisfaction at 50% for Spring 2023, 59% for Fall 2023, and 55% for Spring 2024. Time Period Satisfaction Percent Spring 2023 50% Fall 2023 59% Spring 2024 55%
- [p006_c0003] › In early 2023, we began hearing complaints from customers about missed transfers at Jamaica › This was also apparent in our customer satisfaction surveys › Using data from the TrainTime app, we worked with LIRR to develop a “Jamaica on-time performance” metric
[p006_c0004] _6_

## Page 7

> [p007_c0001] An aerial photograph capturing a dense urban landscape. On the left, a large, modern building complex with a grid-like facade of windows and balconies dominates the foreground. Below it, a railway yard with numerous tracks stretches across the middle ground. A small, dark, traditional-style building, possibly a signal box or water tower, is situated near the tracks. Several utility structures, including electrical substations and overhead catenary poles, are visible. In the background, a city skyline with various buildings of different architectural styles and heights rises against a clear sky. The overall scene depicts a blend of modern architecture and established infrastructure.

## Page 8

### [p008_c0001] File ▾ Export ▾ Share Get insights Subscribe to report
### [p008_c0002] 🔄 📌
### [p008_c0003] Schedule deviation by branch and location
[p008_c0004] Note: Prior to 7/9/2024, schedule deviations for departures from PWS, FRY, WHD, HEM, HUN, LBH are based on manual (TIMACS) timings. On and after 7/9,
[p008_c0005]

```text
Service Date
```
[p008_c0006]

```text
Location considered Origin Jamaica Arrive
```
[p008_c0007]

```text
Branch Select all BY Western Term. Select all ATL
```
[p008_c0008]

```text
Day of Week Monday/Friday Tuesday/Wednesday/Thursd...
```
[p008_c0009]

```text
Direction W AM / PM / Off-... AM Off-peak
```
[p008_c0010]

```text
Train 1013 1017 Origin station Select all BTA
```
> [p008_c0011] Jamaica Arrive Sch. dev. (min.) Blank < 1 1 - 2 2 - 3 3 - 4 4 - 6 6+ Branch Blank < 1 1 - 2 2 - 3 3 - 4 4 - 6 6+ BY 4.20% 14.10% 23.64% 24.42% 16.75% 12.64% 4.24% RK 14.14% 17.39% 14.97% 15.99% 12.68% 16.11% 8.73% HH 4.49% 24.11% 21.18% 19.88% 14.52% 10.46% 5.36% LB 3.70% 24.39% 27.24% 17.74% 14.36% 9.61% 9.61% FR 11.15% 39.01% 20.58% 13.83% 7.93% 6.00% 6.00% HM 3.89% 3.75% 14.86% 24.72% 20.14% 22.50% 10.14% WH 1.00% 1.00% 13.44% 28.42% 24.55% 23.77% 4.39% PJ 24.34% 8.20% 9.79% 19.31% 8.73% 17.72% 11.90% OB 1.00% 31.89% 11.89% 13.51% 13.24% 16.49% 9.73%
[p008_c0012]

```text
Train level JAM OTP Train Branch Number of trips Western terminal Western terminal scheduled Origin Dest. Median Origin dept. sched. dev. Median Jamaica arr. sched. dev. Median Jamaica dwell Median Jamaica dept. sched. dev. Median Dest. arr. sched. dev. 2699 RK 79 GCT 08:07 HVL GCT 4.67 2.6 1.2 3.0 -0.38 1127 BY 79 NYK 08:02 WGH NYK 3.43 2.1 1.4 2.5 -0.13 1233 BY 78 GCT 08:35 FPT GCT 3.24 2.9 1.2 2.0 0.92 1117 BY 77 NYK 06:26 WGH NYK 2.88 2.7 1.0 2.8 2.30 2103 RK 78 NYK 08:17 FMD NYK 2.81 4.1 1.3 4.4 3.61 133 BY 78 NYK 09:25 BTA NYK 2.75 1.6 1.4 2.0 0.78 1123 BY 77 NYK 07:31 WGH NYK 2.55 3.8 1.1 3.9 4.15 2503 HH 77 NYK 09:02 HVL NYK 2.53 3.1 1.0 3.3 3.72 1225 BY 76 GCT 07:18 WGH GCT 2.52 2.4 1.4 2.9 2.27 Total 8993 0.65 2.4 1.3 2.7 2.10
```

## Page 9

### [p009_c0001] Two-thirds of customers are now satisfied with their transfer experience at Jamaica
### [p009_c0002] Key LIRR actions
- [p009_c0003] › Reallocated running times to better match typical operating conditions › Refined stopping patterns and routings to enable parallel moves › Focused on getting trains out of their origins on time › Ensured TrainTime shows multiple transfer opportunities and platform assignments earlier
> [p009_c0004] Jamaica Passenger Transfer Satisfaction Satisfaction with transfer experience for passengers changing at Jamaica The bar chart displays the percentage of passengers satisfied with their transfer experience at Jamaica over a two-year period. The y-axis represents the percentage, ranging from 40% to 70% in 5% increments. The x-axis shows the time periods: Spring 2023, Fall 2023, Spring 2024, Fall 2024, Spring 2025, and Fall 2025. The satisfaction percentage is 50% in Spring 2023, 59% in Fall 2023, 55% in Spring 2024, 63% in Fall 2024, 66% in Spring 2025, and 67% in Fall 2025. Time Period Satisfaction Percent Spring 2023 50% Fall 2023 59% Spring 2024 55% Fall 2024 63% Spring 2025 66% Fall 2025 67%
[p009_c0005] _9_

## Page 10

### [p010_c0001] Jamaica OTP improved from 60-65% to 70-75%
### [p010_c0002] Long Island Rail Road Jamaica On-Time Performance
[p010_c0003] Jamaica on-time performance measures the percentage of trains that arrive within three minutes of schedule at Jamaica Station. All branches, except the Port Washington Branch, converge at Jamaica Station, making it the primary LIRR transfer hub. The opening of Grand Central Madison in January 2023 elevated Jamaica's role as a critical transfer point.
[p010_c0004] Select a start and end date Jan 23 Jan 26 Branch (selects 'Systemwide' if blank) Systemwide Peak / Offpeak Overall
[p010_c0005] From mta.metrics.info and NYS Open Data
> [p010_c0006] Month Monthly (%) 12-Month Average (%) January 2023 66 64 February 2023 66 64 March 2023 64 64 April 2023 66 64 May 2023 65 64 June 2023 59 64 July 2023 64 64 August 2023 59 64 September 2023 63 64 October 2023 65 64 November 2023 66 64 December 2023 68 64 January 2024 67 64 February 2024 70 64 March 2024 66 64 April 2024 65 64 May 2024 67 64 June 2024 67 64 July 2024 68 64 August 2024 70 64 September 2024 73 64 October 2024 73 64 November 2024 75 64 December 2024 74 64 January 2025 72 64 February 2025 73 64 March 2025 75 64 April 2025 73 64 May 2025 74 64 June 2025 72 64 July 2025 73 64 August 2025 73 64 September 2025 74 64 October 2025 71 64 November 2025 72 64 December 2025 72 64 January 2026 72 64
[p010_c0007] _10_

## Page 11

### [p011_c0001] Rolling out Student OMNY program with enhanced benefits
> [p011_c0002] Daily Student Ridership (2024 vs 2023) Daily student taps on the MTA network (includes transfers) The chart displays daily student ridership on the MTA network from September 8, 2024, to December 29, 2024. The y-axis represents ridership in thousands (k), ranging from 0 to 600k. The x-axis represents the transit date. Two lines are plotted: 2024 Ridership (blue line) and 2023 Ridership (grey line). The 2024 Ridership line is consistently higher than the 2023 Ridership line, indicating a significant increase in daily student taps. The 2024 Ridership line shows a clear upward trend, starting around 300k in early September and reaching nearly 500k by late December. The 2023 Ridership line remains relatively stable, fluctuating between 100k and 400k throughout the period. Transit Date 2024 Ridership (k) 2023 Ridership (k) Sep 8 2024 300 100 Sep 22 480 380 Oct 6 500 380 Oct 20 520 380 Nov 3 530 360 Nov 17 520 380 Dec 1 500 380 Dec 15 490 360 Dec 29 200 100
- [p011_c0003] › In 2024, MTA and NYCPS rolled out Student OMNY with 670K cards across 2600 schools › Usage grew by 35% › Fare evasion on the bus fell by 4pp › The MTA Data Lake tracked this program in real-time › Cards not being used appropriately could be identified and deactivated
[p011_c0004] _11_

## Page 12

### [p012_c0001] Monitoring health of vending machines and other devices
- [p012_c0002] › The MTA Data Lake ingests 2.5M rows of data per day from Cubic on the status of devices like bus validators and vending machines › We can track downtime and identify trends in specific error types › Configurable Vending Machine (CVM) downtime has decreased from 6% in December 2025 to 3% in February 2026
> [p012_c0003] CVM: Average Device Status Percent of Total Device Hours Percent 100% 80% 60% 40% 20% 0% Out of Service No Cash No Debit Other In Service Date Oct 19 2025 Nov 2 Nov 16 Nov 30 Dec 14 Dec 28 Jan 11 2026 Jan 25 Feb 8 Feb 22 Date Out of Service No Cash No Debit Other In Service Oct 19 2025 6% 10% 5% 10% 69% Nov 2 2025 5% 10% 5% 10% 70% Nov 16 2025 5% 10% 5% 10% 70% Nov 30 2025 5% 10% 5% 10% 70% Dec 14 2025 6% 10% 5% 10% 69% Dec 28 2025 6% 10% 5% 10% 69% Jan 11 2026 3% 10% 5% 10% 72% Jan 25 2026 3% 10% 5% 10% 72% Feb 8 2026 3% 10% 5% 10% 72% Feb 22 2026 3% 10% 5% 10% 72%
[p012_c0004] _12_

## Page 13

### [p013_c0001] Employee availability is a critical metric at MTA
> [p013_c0002] Availability Annualized to 260.89 Days Year Available Sick, WC, LOA Vacation, Holidays, Training Total 2016 204 23 33 260 2017 205 23 34 262 2018 205 24 33 262 2019 204 25 31 260 2020 190 43 28 261 2021 194 34 33 261 2022 195 34 31 260 2023 198 31 32 261 2024 198 31 33 262 2025 200 29 31 260
- [p013_c0003] › When employees do not come to work as scheduled, it becomes more difficult and costly to deliver service › Short-notice absences often require overtime to cover › Long-term absences necessitate additional hiring › Each day of improved availability saves MTA $17M annually
[p013_c0004] _13_

## Page 14

### [p014_c0001] Availability was declining, but has started to improve
- [p014_c0002] › Availability had been declining from 2016 to 2019 – but dropped 10 days after COVID, driven by increased sick leave and Workers Comp (WC) › Having better visibility into this metric allows us to evaluate initiatives on absenteeism, such as improvements in WC claims handling › Availability has recently improved, for many work groups
> [p014_c0003] Availability By Year And Job Group Days available per year Job Group 2016 2019 2022 2025 Bus operators 196 195 187 190 Car maintainers 219 214 213 209 Conductors 201 196 180 192 Signal workers 215 211 206 200 Track workers 204 206 193 198 Train operators 204 199 188 194
[p014_c0004] _14_

## Page 15

### [p015_c0001] The Data Lake is starting to change how the MTA works
[p015_c0002] The Data Lake and the team at Data and Analytics have been instrumental in bringing more transparency into the MTA's supply chain across Operating Agencies. The initiative allowed us to take disparate systems responsible for forecasting and inventory management and align on key metrics systematically to help drive improvements .
[p015_c0003] Lawrence Siegel – Senior Director, Administration
[p015_c0004] We built the OMNY go-to-market strategy on the MTA data lake. Access to data about payment method, rider class (student, Reduced Fare, Fair Fares, etc.), and station or bus route helped us develop, measure, and evolve the plan to help all customers make the switch to tap-and-ride before turning off MetroCard sales.
[p015_c0005] Jessica Lazarus – Deputy Chief, Commercial Ventures
[p015_c0006] CBTC systems produce an immense wealth of data — billions of data points every week. Ingesting it into the MTA Data Lake allows us to perform large-scale data analysis to dive deep into train performance and system operation. It also enables us to fuse this with other sources – like EAM and incident reporting.
[p015_c0007] Kurt Raschke – Senior Director, Subway Systems
[p015_c0008] Teams are now aligned around the same datasets , which has made cross-functional collaboration faster and far more effective .
[p015_c0009] Sunil Nair – Chief Officer, Bus Technology
[p015_c0010] _15_

// 서류 양식. 원본(hwp·docx 등)을 보고 하나씩 HTML로 옮김 — html 이 없으면 '준비 중'으로 보임
// 칸 표시: data-f="칸 이름" (input 또는 contenteditable), data-profile="name" 이면 내 정보로 미리 채움,
//          data-count="300" 이면 글자 수를 셈, data-ph="..." 는 빈 칸 안내 글, data-stamp 는 도장 자리
// {year} 는 문서 연도로 바뀜. file = PDF 저장할 때 제안할 파일 이름 ({칸 이름}·{year} 사용)
window.FORMS = {
  groups: [['yearly', '매년'], ['trip', '출장'], ['buy', '구매'], ['meeting', '회의'], ['etc', '기타']],

  // 내 정보 — 서류마다 소속·성명 등을 미리 채움 (예시 값 — 설정 옆 '내 정보'에서 바꿔요). 도장·서명은 앱에서 이미지를 골라 넣음
  // gender·birth(생년월일 → 출장 서류의 만 나이)는 출장 서류용. en* 는 영문 레터용
  profile: {
    dept: '의학과', rank: '조교수', name: '홍길동', office: '053-950-0000', mobile: '', email: 'pi@example.ac.kr', room: '의과대학 ○호관 ○○○호', gender: '', birth: '',
    enName: 'Gildong Hong', enSig: 'Gildong Hong, Ph.D.', enTitle: 'Assistant Professor\nDepartment of ○○\nSchool of Medicine, Kyungpook National University',
    enAddr: '680 Gukchaebosang-ro, Jung-gu, Daegu 41944, South Korea',
  },

  list: [
    {
      id: 'edu-mid', group: 'yearly', emoji: '🎓', title: '교육 중간보고서', yearly: true,
      src: '교육 중간보고서 (학과 배포 양식)',
      file: '{소속}_{성명}_{year}학년도_교육_중간보고서',
      html: `
<h1>{year}학년도 교육 중간보고서</h1>
<table class="f-tbl">
  <colgroup><col style="width:10%"><col style="width:42%"><col style="width:8%"><col style="width:14%"><col style="width:8%"><col style="width:18%"></colgroup>
  <tr class="h33">
    <td class="label">소속</td><td><input data-f="소속" data-profile="dept"></td>
    <td class="label">직급</td><td><input data-f="직급" data-profile="rank"></td>
    <td class="label">성명</td><td><input data-f="성명" data-profile="name"></td>
  </tr>
</table>
<table class="f-tbl">
  <colgroup><col style="width:14%"><col style="width:13%"><col style="width:24%"><col style="width:13%"><col style="width:36%"></colgroup>
  <tr class="h35">
    <td class="label">연락처</td>
    <td class="label">연구실</td><td><input data-f="연구실 연락처" data-profile="office"></td>
    <td class="label">핸드폰</td><td><input data-f="핸드폰" data-profile="mobile"></td>
  </tr>
</table>
<table class="f-tbl mt12">
  <colgroup><col style="width:12%"><col style="width:44%"><col style="width:44%"></colgroup>
  <tr><td class="section">기본사업</td><td class="section">1학기</td><td class="section">2학기</td></tr>
  <tr>
    <td class="label">강의시수</td>
    <td><div>□ 강의시수</div>
      <div class="small mt7">- 책임시수 <span class="line" data-f="1학기 책임시수"></span> 학점</div>
      <div class="small mt7">- 담당시수 <span class="line" data-f="1학기 담당시수"></span> 학점</div></td>
    <td><div>□ 강의시수</div>
      <div class="small mt7">- 책임시수 <span class="line" data-f="2학기 책임시수"></span> 학점</div>
      <div class="small mt7">- 담당시수 <span class="line" data-f="2학기 담당시수"></span> 학점</div></td>
  </tr>
  <tr>
    <td class="label">담당교과목<br><span class="small">(수강인원)</span></td>
    <td><div>□ 담당교과목(수강인원)</div><div class="box" data-f="1학기 담당교과목" data-ph="- 과목명 (대상, 구분 학점) 인원"></div></td>
    <td><div>□ 담당교과목(수강인원)</div><div class="box" data-f="2학기 담당교과목" data-ph="- 과목명 (대상, 구분 학점) 인원"></div></td>
  </tr>
  <tr>
    <td class="label">강의평가<br>결과</td>
    <td><div>□ 강의평가 결과 :</div><div class="box" data-f="1학기 강의평가" data-ph="내용 입력"></div></td>
    <td><div>□ 강의평가 결과 :</div><div class="box" data-f="2학기 강의평가" data-ph="내용 입력"></div></td>
  </tr>
  <tr>
    <td class="label"><span class="label-sm">강의활동<br>평가·분석<br>및 보완·개선 사항</span></td>
    <td colspan="2">
      <div>□ 강의활동 평가·분석 및 보완·개선 사항 <span class="small">(300자 이상 기재)</span></div>
      <div class="tiny mt3">(교육활동 실적심사를 위해 면밀히 작성)</div>
      <div class="box" data-f="강의활동 분석" data-count="300" data-ph="여기에 내용을 입력하세요."></div>
    </td>
  </tr>
</table>
<div class="submit">
  위와 같이 {year}학년도 교육 중간보고서를 제출합니다.
  <div class="date-line">
    <span class="date" data-f="제출 연">{year}</span> 년
    <span class="date" data-f="제출 월"></span> 월
    <span class="date" data-f="제출 일"></span> 일
  </div>
  <div class="sign-row">
    <div>제출자 :</div>
    <div>소속 <span class="sign" data-f="제출자 소속" data-profile="dept"></span></div>
    <div>성명 <span class="sign" data-f="제출자 성명" data-profile="name"></span><span data-stamp></span></div>
  </div>
  <div class="president">경북대학교 총장 귀하</div>
</div>`,
    },
    // 출장 양식은 forms-trip.js, 구매 규격서는 forms-buy.js, 회의록·영문 레터는 forms-misc.js
    // html·pages 가 없고 src 만 있는 양식은 '준비 중'으로 보임
  ],

  // 예시 문서 (가짜 내용 — 소속·성명은 내 정보에서 채움)
  docs: [
    { id: 'd-edu-ex', tpl: 'edu-mid', year: 2026, title: '2026학년도 교육 중간보고서 (예시)', fields: {
      '1학기 담당시수': '6.00',
      '2학기 담당시수': '7.50',
      '1학기 담당교과목': [
        '- 의학연구 방법론 (대학원, 전공 3학점) 25명',
        '- 의학유전학 (의예과 2학년, 전공필수 2학점) 120명',
      ].join('\n'),
      '2학기 담당교과목': [
        '- 생물정보학 입문 (대학원, 전공 3학점) 30명',
        '- 의생명과학실험 (의예과 2학년, 전공필수 2학점) 60명',
      ].join('\n'),
      '1학기 강의평가': '- 의학연구 방법론 : 4.70 / 개설대학 4.60 (예시)',
      '2학기 강의평가': '- 2학기 강의평가는 학기말 시행 예정',
      '강의활동 분석': [
        '□ 강의평가 결과',
        ' - 개설대학 평균보다 조금 높음 (예시). 서술형 응답에서 실습 자료가 도움이 됐다는 의견이 많음',
        '□ 보완·개선 사항',
        ' - 학습 분량 부담 → 주차별 핵심 학습목표를 3개 이내로 정리하고, 심화 내용은 보충자료로 분리',
        ' - 대학원 과목 응답률이 낮음 → 학기 중간 자체 설문을 함께 하고 피드백을 일찍 반영',
      ].join('\n'),
    } },
  ],
};
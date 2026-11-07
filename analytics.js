/* Data Learners · GA4 analytics
 * 측정 ID는 index.html의 <meta name="ga-measurement-id">에서 읽습니다.
 * 플레이스홀더(G-XXXXXXXXXX)이거나 비어 있으면 gtag를 로드하지 않습니다.
 * ?ga_debug=1 을 붙이면 GA DebugView로 전송하고 콘솔에도 이벤트를 출력합니다.
 * 폼 입력값(이름·이메일 등 개인정보)은 어떤 이벤트에도 담지 않습니다.
 */
(()=>{
  const meta=document.querySelector('meta[name="ga-measurement-id"]');
  const ID=(meta&&meta.content||'').trim();
  const debug=/[?&]ga_debug=1\b/.test(location.search);
  /* 공식 도메인에서만 수집합니다. 로컬 미리보기·이전 주소(github.io)·복사된 사이트의 조회가 지표에 섞이지 않게 합니다.
   * 다른 호스트에서 확인이 필요하면 ?ga_debug=1 을 붙입니다. */
  const PROD_HOSTS=['www.data-learners.com','data-learners.com'];
  const enabled=/^G-[A-Z0-9]+$/.test(ID)&&ID!=='G-XXXXXXXXXX'&&(PROD_HOSTS.includes(location.hostname)||debug);

  /* 내부 트래픽 표시: 운영자 기기에서 ?dl_internal=1 로 한 번 열면 이 브라우저의 조회에 traffic_type=internal 이 붙습니다.
   * GA4 관리 > 데이터 필터의 '내부 트래픽' 필터가 이 값을 기준으로 제외합니다. 해제는 ?dl_internal=0 */
  const INTERNAL_KEY='dl_internal';
  let internal=false;
  try{
    const q=location.search.match(/[?&]dl_internal=([01])\b/);
    if(q){if(q[1]==='1')localStorage.setItem(INTERNAL_KEY,'1');else localStorage.removeItem(INTERNAL_KEY)}
    internal=localStorage.getItem(INTERNAL_KEY)==='1';
  }catch(_){}

  window.dataLayer=window.dataLayer||[];
  window.gtag=window.gtag||function(){dataLayer.push(arguments)};
  if(enabled){
    const s=document.createElement('script');
    s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ID);
    document.head.appendChild(s);
    gtag('js',new Date());
    const cfg={};
    if(debug)cfg.debug_mode=true;
    if(internal)cfg.traffic_type='internal';
    gtag('config',ID,cfg);
  }

  const track=(name,params={})=>{
    if(debug)console.info('[ga]',name,params);
    if(enabled)gtag('event',name,params);
  };
  window.dlTrack=track;

  const $$=(s,c=document)=>[...c.querySelectorAll(s)];
  const txt=el=>el?(el.innerText||el.textContent):"";
  const clean=t=>(t||'').replace(/[↗↘]/g,'').replace(/\s+/g,' ').trim().slice(0,100);
  const where=el=>{
    if(el.closest('#siteNav'))return 'nav';
    if(el.closest('#mobileCta'))return 'mobile_cta';
    if(el.closest('footer'))return 'footer';
    if(el.closest('#inquiryDialog'))return 'inquiry_dialog';
    if(el.closest('#brochureDialog'))return 'brochure_dialog';
    const s=el.closest('section[id]');return s?s.id:'other';
  };
  const linkType=u=>{
    const h=u.hostname.replace(/^www\./,'');
    if(h==='wikidocs.net')return /\/profile\//.test(u.pathname)?'wikidocs_profile':'wikidocs_book';
    if(h.endsWith('linkedin.com'))return 'linkedin';
    if(h==='public.tableau.com')return 'tableau_public';
    if(h==='github.com')return 'github';
    if(h.endsWith('n8n.cloud'))return 'inquiry_form';
    return 'other';
  };

  /* 클릭: CTA(문의·과정 이동), 외부 링크 */
  document.addEventListener('click',e=>{
    const a=e.target.closest('a[href]');if(!a)return;
    const loc=where(a),text=clean(a.textContent);
    if(a.hasAttribute('data-open-inquiry')){
      track('cta_click',{cta_type:'inquiry',cta_text:text,cta_location:loc,course_name:a.dataset.course||'(none)'});
      return;
    }
    /* 소개서 버튼은 신청 모달을 연다. 실제 파일 다운로드는 모달 안 링크 클릭(data-from=원래 위치)으로 기록 */
    if(a.hasAttribute('data-open-brochure')){
      track('cta_click',{cta_type:'brochure',cta_text:text,cta_location:loc});
      if('showModal' in document.createElement('dialog'))return;
    }
    let u;try{u=new URL(a.href,location.href)}catch(_){return}
    /* 다운로드: 향상된 측정이 .pdf 클릭을 file_download로 자동 기록하므로 중복을 피해 별도 이름으로 보냄 */
    if(a.hasAttribute('download')){
      track('brochure_download',{file_name:u.pathname.split('/').pop(),cta_text:text,cta_location:a.dataset.from||loc});
      return;
    }
    if(u.origin===location.origin&&u.pathname!==location.pathname){
      track('subsite_click',{link_target:u.pathname,cta_text:text,cta_location:loc});
      return;
    }
    if(u.origin===location.origin&&u.pathname===location.pathname&&u.hash){
      if(a.classList.contains('btn'))track('cta_click',{cta_type:'navigation',cta_text:text,cta_location:loc,link_target:u.hash.slice(1)});
      else if(a.closest('#navLinks, .footer-links'))track('nav_click',{link_target:u.hash.slice(1),cta_location:loc});
      return;
    }
    if(u.origin!==location.origin){
      const book=a.classList.contains('book-card')?clean(txt($$('h3',a)[0])):'';
      track('outbound_click',{link_type:linkType(u),link_domain:u.hostname,link_url:u.href.slice(0,100),cta_location:loc,book_title:book||'(none)'});
    }
  },true);

  /* 과정 필터 */
  $$('.filter[data-filter]').forEach(b=>b.addEventListener('click',()=>track('course_filter',{filter_value:b.dataset.filter})));

  /* 후기 필터·더 보기 */
  $$('.rv-filter[data-rv-filter]').forEach(b=>b.addEventListener('click',()=>track('review_filter',{filter_value:b.dataset.rvFilter})));
  $$('#reviewMore').forEach(b=>b.addEventListener('click',()=>track('review_more',{})));

  if('IntersectionObserver' in window){
    /* 섹션 노출: 화면 중앙선을 지나간 섹션을 페이지당 1회 기록 */
    const so=new IntersectionObserver(es=>es.forEach(en=>{
      if(!en.isIntersecting)return;so.unobserve(en.target);
      track('section_view',{section_id:en.target.id});
    }),{rootMargin:'-45% 0px -50% 0px'});
    $$('main section[id]').forEach(s=>so.observe(s));

    /* 과정 카드 노출: 카드 60% 이상이 1초 이상 보이면 1회 기록 */
    const timers=new Map();
    const co=new IntersectionObserver(es=>es.forEach(en=>{
      const c=en.target;
      if(en.isIntersecting&&!c.hidden){
        if(!timers.has(c))timers.set(c,setTimeout(()=>{
          co.unobserve(c);
          track('course_view',{course_name:clean(txt($$('h3',c)[0])),course_category:c.dataset.category||'(none)'});
        },1000));
      }else{clearTimeout(timers.get(c));timers.delete(c)}
    }),{threshold:.6});
    $$('.course-card').forEach(c=>co.observe(c));
  }

  /* 스크롤 깊이: 25/50/75/100% 각 1회 (90%는 향상된 측정의 기본 scroll 이벤트가 담당) */
  const marks=[25,50,75,100],sent=new Set();let tick=false;
  const onScroll=()=>{
    tick=false;
    const max=document.documentElement.scrollHeight-innerHeight;if(max<=0)return;
    const pct=Math.round(scrollY/max*100);
    marks.forEach(m=>{if(pct>=m&&!sent.has(m)){sent.add(m);track('scroll_depth',{percent_scrolled:m})}});
  };
  addEventListener('scroll',()=>{if(!tick){tick=true;requestAnimationFrame(onScroll)}},{passive:true});

  /* 문의 퍼널: 모달 열림 → 입력 시작 → 제출 성공(generate_lead) / 실패 */
  const dlg=document.getElementById('inquiryDialog'),form=document.getElementById('inquiryForm');
  const done=document.getElementById('inquiryDone'),status=document.getElementById('inquiryStatus');
  if(dlg&&form&&done&&'MutationObserver' in window){
    let started=false;
    new MutationObserver(()=>{if(dlg.open){started=false;track('inquiry_open',{})}}).observe(dlg,{attributes:true,attributeFilter:['open']});
    form.addEventListener('input',()=>{if(!started){started=true;track('inquiry_start',{})}});
    form.addEventListener('submit',()=>{track('inquiry_submit_attempt',{})});
    new MutationObserver(()=>{
      if(done.hidden)return;
      const fd=new FormData(form);
      track('generate_lead',{
        lead_type:'inquiry',
        edu_type:(fd.get('edu_type')||'(none)').toString(),
        course_name:fd.getAll('courses').join(', ').slice(0,100)||'(none)',
        course_count:fd.getAll('courses').length
      });
    }).observe(done,{attributes:true,attributeFilter:['hidden']});
    if(status)new MutationObserver(()=>{if(status.textContent.includes('전송에 실패'))track('inquiry_error',{})}).observe(status,{childList:true,subtree:true});
  }

  /* 소개서 퍼널: 모달 열림 → 제출 시도 → 제출 성공(generate_lead, lead_type=brochure) / 실패 */
  const bDlg=document.getElementById('brochureDialog'),bForm=document.getElementById('brochureForm');
  const bDone=document.getElementById('brochureDone'),bStatus=document.getElementById('brochureStatus');
  if(bDlg&&bForm&&bDone&&'MutationObserver' in window){
    new MutationObserver(()=>{if(bDlg.open)track('brochure_open',{})}).observe(bDlg,{attributes:true,attributeFilter:['open']});
    bForm.addEventListener('submit',()=>{track('brochure_submit_attempt',{})});
    new MutationObserver(()=>{
      if(!bDone.hidden)track('generate_lead',{lead_type:'brochure',cta_location:document.getElementById('brochureFile').dataset.from||'(none)'});
    }).observe(bDone,{attributes:true,attributeFilter:['hidden']});
    if(bStatus)new MutationObserver(()=>{if(bStatus.textContent.includes('전송에 실패'))track('brochure_error',{})}).observe(bStatus,{childList:true,subtree:true});
  }
})();

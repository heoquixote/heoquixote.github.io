/* Data Learners · 사이트 에러 수집기
 * 방문자 브라우저에서 난 에러를 n8n 웹훅(dl/site-error)으로 보내 Discord 알림과 GitHub Issue로 이어지게 합니다.
 *
 * 잡는 것
 *  - js: 잡히지 않은 스크립트 에러 (window error)
 *  - promise: 처리되지 않은 Promise 거부 (unhandledrejection)
 *  - resource: 스크립트·스타일·이미지 로드 실패 (capture 단계 error 이벤트)
 *  - render: 에러 없이 화면이 빈 경우. <script data-expect="선택자,선택자"> 로 지정한 요소가 load 후에도 0개면 보고
 *
 * 지키는 것
 *  - 공식 도메인에서만 동작 (다른 호스트는 ?dl_monitor=1 일 때만, 콘솔에도 출력)
 *  - 내부 트래픽(?dl_internal=1 로 표시한 브라우저)과 자동화 브라우저(navigator.webdriver)는 보내지 않음
 *  - 같은 에러는 한 번만, 페이지당 최대 5건, 탭(세션)당 최대 15건
 *  - 개인정보 없음: 쿼리스트링을 지운 경로, 에러 메시지·스택(길이 제한), 화면 크기, 브라우저 종류만 보냄
 *  - CORS preflight 없는 sendBeacon(form-urlencoded)이라 응답을 기다리지 않고 페이지 성능에 영향이 없음
 *
 * 이 파일은 다른 스크립트보다 먼저(<head> 맨 위, defer 없이) 불러와야 인라인 스크립트의 에러도 잡힙니다.
 */
(()=>{
  const ENDPOINT='https://hote.app.n8n.cloud/webhook/dl/site-error';
  const PROD_HOSTS=['www.data-learners.com','data-learners.com'];
  const RELEASE='2026-11-22';
  const MAX_PER_PAGE=5,MAX_PER_SESSION=15,RENDER_DELAY=5000;

  const me=document.currentScript;
  const debug=/[?&]dl_monitor=1\b/.test(location.search);
  let internal=false;
  try{
    const q=location.search.match(/[?&]dl_internal=([01])\b/);
    internal=q?q[1]==='1':localStorage.getItem('dl_internal')==='1';
  }catch(_){}
  const enabled=debug||(PROD_HOSTS.includes(location.hostname)&&!internal&&!navigator.webdriver);

  const seen=new Set();let sentThisPage=0;
  const cut=(s,n)=>String(s==null?'':s).slice(0,n);
  const stripQuery=u=>{try{const x=new URL(u,location.href);return x.origin===location.origin?x.pathname:x.origin+x.pathname}catch(_){return cut(u,200)}};
  const IGNORE=[
    /^Script error\.?$/i,                 // 다른 출처 스크립트의 내용 없는 에러
    /ResizeObserver loop/i,               // 브라우저가 내는 무해한 경고
    /Java object is gone|WebViewJavascriptBridge|instantSearchSDKJSBridge/i, // 인앱 브라우저 네이티브 연결 끊김
    /Can't find variable: (gmo|__gCrWeb|webkit)\b/i
  ];
  // 사이트 코드가 아닌 곳: 인앱 브라우저(인스타그램·페이스북 iabjs://)가 주입한 스크립트, 확장 프로그램
  const FOREIGN=/(iabjs|chrome-extension|moz-extension|safari-extension|safari-web-extension|webkit-masked-url|ms-browser-extension):\/\/|extension\//i;
  const ignored=(msg,src,stack)=>IGNORE.some(r=>r.test(msg||''))||FOREIGN.test(src||'')||FOREIGN.test(stack||'');

  const report=(type,data)=>{
    const msg=cut(data.message,300),src=data.source?stripQuery(data.source):'';
    if(ignored(msg,data.source,data.stack))return;
    const key=[type,msg,src,data.line||''].join('|');
    if(seen.has(key))return;seen.add(key);
    if(type!=='render'&&sentThisPage>=MAX_PER_PAGE)return; // 렌더링 실패는 한도와 무관하게 보낸다
    let n=0;try{n=+sessionStorage.getItem('dl_err_n')||0;if(n>=MAX_PER_SESSION)return;sessionStorage.setItem('dl_err_n',n+1)}catch(_){}
    sentThisPage++;
    const payload={
      v:1,type,release:RELEASE,
      message:msg,source:src,line:data.line||0,col:data.col||0,
      stack:cut((data.stack||'').split('\n').slice(0,8).join('\n').replace(/\?[^\s:)]*/g,''),1200),
      page:location.pathname+(location.hash&&location.hash.length<40?location.hash:''),
      title:cut(document.title,80),
      vw:innerWidth,vh:innerHeight,
      ua:cut(navigator.userAgent,180),
      at:new Date().toISOString()
    };
    if(debug)console.info('[dl-monitor]',payload);
    if(!enabled)return;
    try{
      const body=new URLSearchParams({payload:JSON.stringify(payload)});
      if(!(navigator.sendBeacon&&navigator.sendBeacon(ENDPOINT,body))){
        fetch(ENDPOINT,{method:'POST',body,mode:'no-cors',keepalive:true}).catch(()=>{});
      }
    }catch(_){}
  };
  window.dlReportError=(message,extra={})=>report('manual',{message,...extra});

  /* 스크립트 에러 + 리소스 로드 실패. 리소스 에러는 버블링되지 않아 capture 단계에서 받는다 */
  addEventListener('error',e=>{
    const t=e.target;
    if(t&&t!==window&&t.tagName){
      const url=t.src||t.href||t.currentSrc||'';
      if(!url)return;
      report('resource',{message:`${t.tagName.toLowerCase()} 로드 실패`,source:url});
      return;
    }
    report('js',{message:e.message,source:e.filename,line:e.lineno,col:e.colno,stack:e.error&&e.error.stack});
  },true);

  addEventListener('unhandledrejection',e=>{
    const r=e.reason;
    report('promise',{message:r&&r.message?r.message:cut(typeof r==='string'?r:JSON.stringify(r),300),stack:r&&r.stack});
  });

  /* 렌더링 검증: 에러가 없어도 핵심 영역이 비어 있으면 보고 */
  const expect=(me&&me.dataset.expect||'').split(',').map(s=>s.trim()).filter(Boolean);
  if(expect.length){
    const check=()=>{
      const empty=expect.filter(sel=>{try{return !document.querySelector(sel)}catch(_){return false}});
      if(empty.length)report('render',{message:`빈 영역: ${empty.join(', ')}`});
    };
    const later=()=>setTimeout(check,RENDER_DELAY);
    if(document.readyState==='complete')later();else addEventListener('load',later,{once:true});
  }
})();

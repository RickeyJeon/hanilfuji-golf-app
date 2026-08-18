(function(){
  document.querySelectorAll('input[type="password"]').forEach(function(input){
    if(input.dataset.visibilityReady)return;
    input.dataset.visibilityReady='1';
    var button=document.createElement('button');
    button.type='button'; button.textContent='◉'; button.setAttribute('aria-label','비밀번호 표시');
    button.style.cssText='position:absolute;right:8px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#6b776f;font-size:16px;padding:7px;cursor:pointer';
    var wrap=document.createElement('span'); wrap.style.cssText='position:relative;display:block';
    input.parentNode.insertBefore(wrap,input); wrap.appendChild(input); wrap.appendChild(button);
    button.onclick=function(){var visible=input.type==='text';input.type=visible?'password':'text';button.textContent=visible?'◉':'◎';button.setAttribute('aria-label',visible?'비밀번호 표시':'비밀번호 숨기기')};
  });
})();

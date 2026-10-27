(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const toggle=document.getElementById('bridgeToggle'),status=document.getElementById('bridgeState');
    if(!toggle||!status)return;
    let connected=false,busy=false;
    function render(result) {
      connected=Boolean(result.running&&result.connected);
      toggle.setAttribute('aria-checked',String(connected));
      toggle.textContent=connected?'已开启':'开启桥接';
      status.textContent=result.message||(connected?'已连接 · '+(result.agent||'Codex'):result.running?'服务运行中，点击连接':'已关闭，点击即可启动');
      status.classList.toggle('bad',!result.ok);
    }
    async function refresh() {
      if(busy)return;
      try {render(await chrome.runtime.sendMessage({type:'BRIDGE_CONTROL',action:'status'}));}
      catch(error){render({ok:false,message:error.message});}
    }
    toggle.addEventListener('click',async()=>{
      busy=true;toggle.disabled=true;status.textContent=connected?'正在关闭…':'正在启动并连接…';
      try {render(await chrome.runtime.sendMessage({type:'BRIDGE_CONTROL',action:connected?'stop':'start'}));}
      catch(error){render({ok:false,message:error.message});}
      finally {busy=false;toggle.disabled=false;}
    });
    await refresh();
    const timer=setInterval(refresh,4000);
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
  });
})();

'use strict';

const sound = (() => {
 let context;
 let resumePending;

 function unlock(){
  try{
   if(!context){
    const Audio = window.AudioContext || window.webkitAudioContext;
    if(!Audio)return;
    context=new Audio();
   }
   if(context.state!=='running')resumePending=context.resume().catch(()=>{});
  }catch{}
 }

 function tone(frequency,endFrequency,offset,duration,volume,type,{attack=0.004,release=duration-attack}={}){
  if(context?.state!=='running')return;
  const start=context.currentTime+offset;
  const end=start+duration;
  const oscillator=context.createOscillator();
  const gain=context.createGain();
  oscillator.type=type;
  oscillator.frequency.setValueAtTime(frequency,start);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency,end);
  gain.gain.setValueAtTime(0.0001,start);
  gain.gain.exponentialRampToValueAtTime(volume,start+attack);
  if(end-release>start+attack)gain.gain.exponentialRampToValueAtTime(volume*.75,end-release);
  gain.gain.exponentialRampToValueAtTime(0.0001,end);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end);
 }

 function feedback(kind){
  try{
   if(kind==='correct'){
    tone(523.25,510,0,.115,.072,'sine',{attack:.012});
    tone(784,755,0,.048,.014,'sine',{attack:.009});
   }else if(kind==='pass'){
    tone(165,117,0,0.060,0.11,'sawtooth');
    tone(126,84,0.081,0.080,0.075,'square');
   }else if(kind==='undo'){
    tone(1040,920,0,.040,.072,'sine');
    tone(510,480,.052,.062,.070,'triangle');
   }else if(kind==='champion'){
    const phrase=[
     {at:0,length:.58,voices:[[73.42,.050,'sine'],[146.83,.036,'sine'],[220,.020,'triangle'],[293.66,.043,'triangle']]},
     {at:.28,length:.40,voices:[[220,.022,'triangle'],[369.99,.038,'triangle']]},
     {at:.57,length:.52,voices:[[98,.044,'sine'],[196,.023,'triangle'],[392,.039,'triangle'],[493.88,.023,'sine']]},
     {at:.92,length:1.65,voices:[[73.42,.052,'sine'],[146.83,.032,'sine'],[293.66,.031,'triangle'],[369.99,.026,'triangle'],[440,.024,'triangle'],[587.33,.033,'sine']]},
     {at:1.21,length:1.02,voices:[[739.99,.015,'sine']]},
     {at:1.43,length:1.14,voices:[[880,.012,'sine'],[1174.66,.008,'sine']]},
    ];
    for(const {at,length,voices} of phrase){
     for(const [frequency,volume,type] of voices){
      tone(frequency,frequency,at,length,volume,type,{attack:.036,release:length*.46});
     }
    }
   }else if(kind==='roundEnd'){
    tone(468,435,0,.16,.082,'triangle');
    tone(326,326,.08,.19,.075,'sine');
   }else if(['select','countdown','roundStart'].includes(kind)){
    const cue=()=>{
     if(kind==='roundStart'){
      tone(540,540,0,.07,.065,'triangle');
      tone(800,800,.055,.10,.058,'sine');
     }else if(kind==='select'){
      tone(835,800,0,.075,.065,'sine');
     }else{
      tone(660,660,0,.067,.075,'sine');
     }
    };
    if(context?.state==='running'){
     cue();
    }else if(resumePending){
     const requested=performance.now();
     resumePending.then(()=>{
      if(performance.now()-requested<180)cue();
     }).catch(()=>{});
    }
   }else{
    tone(950,550,0,0.030,0.047,'triangle');
   }
  }catch{}
 }
 function confetti(delays){
  if(context?.state!=='running'||!context.createBufferSource)return;
  const length=Math.round(context.sampleRate*.1);
  const buffer=context.createBuffer(1,length,context.sampleRate);
  const samples=buffer.getChannelData(0);
  let filtered=0;
  for(let i=0;i<length;i++){
   filtered=filtered*.64+(Math.random()*2-1)*.36;
   samples[i]=filtered*(1-i/length)**4;
  }
  const start=context.currentTime;
  for(const [i,delay] of delays.entries()){
   const source=context.createBufferSource();
   const gain=context.createGain();
   source.buffer=buffer;
   gain.gain.value=i<2?.18:.12;
   source.connect(gain);
   gain.connect(context.destination);
   source.start(start+delay/1000);
  }
 }
 return {unlock,feedback,confetti};
})();

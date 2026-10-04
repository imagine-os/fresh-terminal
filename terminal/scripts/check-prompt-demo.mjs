/** Isolated browser regression: no account and no live model calls. Run after build:app. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
const port = Number(process.env.PROMPT_DEMO_PORT ?? 4791);
const base = `http://127.0.0.1:${port}`;
const out = process.env.PROMPT_DEMO_OUT ?? '/tmp/freshterminal-prompt-demo';
mkdirSync(out,{recursive:true});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','app/vite.config.ts','--host','127.0.0.1','--port',String(port),'--strictPort'],{stdio:'ignore'});
let browser;
const results=[];
try {
  for(let n=0;n<80;n++){if(await fetch(base).then(r=>r.ok).catch(()=>false))break;await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch();
  for(const width of [360,390,768,1280]){
    const context=await browser.newContext({viewport:{width,height:width===768?1024:900},reducedMotion:'reduce'});
    let paidCalls=0;
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===base)return route.continue();
      if(url.pathname==='/health') return route.fulfill({json:{ok:true,keyConfigured:true}});
      if(url.pathname==='/credits/device')return route.fulfill({json:{device:'test-device'}});
      if(url.pathname==='/credits')return route.fulfill({json:{metered:false}});
      if(url.pathname==='/realtime/providers')return route.fulfill({json:{providers:[]}});
      if(url.pathname==='/route'){
        paidCalls++;
        // A controllably pending network request to exercise Stop and next-draft retention.
        await new Promise(r=>setTimeout(r,1500));
        return route.fulfill({status:500,body:'simulated failure'}).catch(()=>{});
      }
      if(url.pathname==='/tag')paidCalls++;
      return route.abort();
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    const input=page.locator('[data-testid="composer"] textarea');
    await input.waitFor();
    await page.getByRole('button',{name:'Try a no-cost demo',exact:true}).click();
    await page.getByRole('button',{name:'Make a page called "Launch notes"',exact:true}).click();
    assert.equal(await input.inputValue(),'Make a page called "Launch notes"');
    await page.locator('[data-testid="chip-tray"]').waitFor();
    // An edited quoted title must stay no-cost even after the background-tag delay.
    await input.fill('Make a page called "Material roadmap"');
    await page.waitForTimeout(1600);
    assert.equal(paidCalls,0,'edited local demo must not request paid tagging');
    await page.screenshot({path:`${out}/draft-${width}.png`,fullPage:true});
    await page.getByRole('button',{name:'Send',exact:true}).click();
    await page.getByRole('heading',{name:'Material roadmap',exact:true}).waitFor();
    await input.fill('Show today');await input.press('Enter');
    await page.getByText('Complete · ready for your next prompt',{exact:true}).waitFor();
    const undo=page.getByRole('button',{name:'Undo',exact:true}).first();
    await undo.waitFor();await undo.click();
    // Undo removes the local page; recovery never touches external data.
    assert.equal(await page.locator('[data-testid="nav-material-roadmap"]').count(),0);
    await input.fill('My next draft');await page.reload();
    await input.waitFor();assert.equal(await input.inputValue(),'My next draft');
    assert.equal(paidCalls,0,'local demo must not consume model credits');
    await input.fill('Explain this example');await input.press('Enter');
    await page.getByRole('button',{name:'Stop',exact:true}).waitFor();
    await input.fill('A newer draft');await page.getByRole('button',{name:'Stop',exact:true}).click();
    await page.getByRole('button',{name:'Edit last prompt',exact:true}).waitFor();
    assert.equal(await input.inputValue(),'A newer draft');
    await page.getByRole('button',{name:'Edit last prompt',exact:true}).click();
    assert.equal(await input.inputValue(),'A newer draft\nExplain this example');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    assert.equal(overflow,false,`overflow at ${width}`);
    const clippedHeader=await page.locator('.region-top button, .region-top a').evaluateAll(els=>els.filter(el=>{const r=el.getBoundingClientRect();return r.width>0 && r.height>0 && (r.x<0 || r.right>innerWidth+1)}).map(el=>el.textContent));
    assert.deepEqual(clippedHeader,[],`header controls clipped at ${width}`);
    const composer=await page.locator('[data-testid="composer"]').boundingBox();
    assert(composer && composer.x>=0 && composer.x+composer.width<=width+1,`composer width at ${width}`);
    await page.screenshot({path:`${out}/recovery-${width}.png`,fullPage:true});
    assert.deepEqual(errors,[]);
    results.push({width,localDemo:true,undo:true,reloadDraft:true,stop:true,newerDraftPreserved:true,overflow,errors});
    await context.close();
  }
  writeFileSync(`${out}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
} finally {await browser?.close();server.kill();}

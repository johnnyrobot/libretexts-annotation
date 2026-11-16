// Engineer verification on the locally running, read-only-imported real-book preview.
// Uses designated local fixture credentials without printing or recording them.
import {chromium,expect} from '@playwright/test';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
const base='http://127.0.0.1:4202';const credentials=JSON.parse(readFileSync('.secrets/demo-credentials.json','utf8'));
const biology={book:'biology',page:'01:_The_Chemical_Basis_of_Life/1.01:_Mixtures_and_Compounds/index.html',block:'p-0'};
const human={book:'human_relations',page:'01:_What_is_Human_Relations/1.02:_Why_Study_Human_Relations/index.html',block:'p-0'};
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const ca=await browser.newContext(),cb=await browser.newContext();const a=await ca.newPage(),b=await cb.newPage();
 async function login(page,id){await page.goto(base+'/social-reading/?'+new URLSearchParams(biology));await page.getByLabel('Demo username').fill(id);await page.getByLabel('Password',{exact:true}).fill(credentials[id]);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.locator('#member')).toBeVisible();}
 await login(a,'alice');await expect(a.locator('#passage')).toContainText('Mixtures are heterogeneous');
 if(process.argv.includes('--readback')){const saved=JSON.parse(readFileSync('.data/books-verification.json','utf8'));await expect(a.locator('.thread').filter({hasText:saved.question})).toContainText(saved.reply);console.log('PASS: existing-book question/reply survived service restart.');}
 else{
  const question='How can we distinguish this mixture? Demo '+Date.now(),reply='A second demo reader responds to this exact Biology passage.';
  await a.getByRole('button',{name:'Discuss this passage'}).focus();await a.keyboard.press('Enter');await expect(a.getByLabel('Your passage question')).toBeFocused();await a.getByLabel('Your passage question').fill(question);await a.getByRole('button',{name:'Post question',exact:true}).click();await expect(a.locator('.thread').filter({hasText:question})).toHaveCount(1);
  await login(b,'bob');const thread=b.locator('.thread').filter({hasText:question});await thread.getByLabel('Reply to this question').fill(reply);await thread.getByRole('button',{name:'Post reply',exact:true}).click();await expect(thread).toContainText(reply);
  await a.reload();await expect(a.locator('.thread').filter({hasText:question})).toContainText(reply);
  const rows=await(await b.request.get(base+'/social-reading/api/threads?'+new URLSearchParams(biology))).json();const row=rows.find(t=>t.text===question);
  const denied=await b.request.post(base+'/social-reading/api/commands',{headers:{origin:base,'content-type':'application/json'},data:{actor:'bob',key:crypto.randomUUID(),kind:'reply',context:human,thread:row.id,version:row.version,text:'Must not attach across books'}});expect(denied.status()).toBe(404);
  await a.getByLabel('Textbook',{exact:true}).selectOption('human_relations');await a.getByLabel('Page',{exact:true}).selectOption(human.page);await expect(a.locator('#page-title')).toContainText('Why Study Human Relations');await expect(a.locator('.thread').filter({hasText:question})).toHaveCount(0);
  await a.getByLabel('Textbook',{exact:true}).selectOption('biology');await a.getByLabel('Page',{exact:true}).selectOption(biology.page);await expect(a.locator('.thread').filter({hasText:question})).toContainText(reply);
  mkdirSync('.impeccable/review',{recursive:true});for(const colorScheme of ['light','dark'])for(const [name,width,height]of [['desktop',1200,900],['mobile',360,800]]){await a.emulateMedia({colorScheme});await a.setViewportSize({width,height});expect(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await a.evaluate(()=>window.scrollTo(0,0));await a.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await a.screenshot({path:`.impeccable/review/books-${name}-${colorScheme}.png`,fullPage:false});await a.locator('.thread').filter({hasText:question}).scrollIntoViewIfNeeded();await a.screenshot({path:`.impeccable/review/books-discussion-${name}-${colorScheme}.png`,fullPage:false});}
  writeFileSync('.data/books-verification.json',JSON.stringify({question,reply,context:biology})+'\n',{mode:0o600});console.log('PASS: real Biology and Human Relations selection, keyboard question, second-account reply, reload, cross-book denial, 360px reflow.');
 }
 await ca.close();await cb.close();
}finally{await browser.close();}

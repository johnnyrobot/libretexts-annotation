// Local visual verification only. Credentials are never printed or captured.
import {chromium} from '@playwright/test';
import {readFileSync} from 'node:fs';
const credentials=JSON.parse(readFileSync('.secrets/demo-credentials.json','utf8'));
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const context=await browser.newContext();const page=await context.newPage();
 await page.goto('http://127.0.0.1:4199/social-reading/');
 await page.getByLabel('Demo username').fill('instructor');await page.getByLabel('Password',{exact:true}).fill(credentials.instructor);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#member').waitFor();await page.getByText('What would make an observation careful enough for somebody else to repeat?',{exact:true}).waitFor();
 for(const colorScheme of ['light','dark'])for(const [name,width,height] of [['desktop',1200,900],['mobile',360,800]]){
  await page.emulateMedia({colorScheme});await page.setViewportSize({width,height});await page.screenshot({path:`.impeccable/review/${name}-${colorScheme}.png`,fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow');
 }
 console.log('Captured signed-in desktop/mobile in light/dark; no horizontal overflow.');
}finally{await browser.close();}

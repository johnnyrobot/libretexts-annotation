import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

// Exercise the public mount/client seam and real browser highlight registry.
test.beforeEach(async ({page}) => {
  await page.route('**/annotation-focus-fixture.mjs', route => {
    const source = readFileSync(new URL('../fixtures/annotation-focus.mjs', import.meta.url), 'utf8');
    return route.fulfill({contentType: 'text/javascript', body: source.replace('mountAnnotations({client});', `
      const privateAnchor = {book:manifest.book, page:manifest.page, revision:manifest.revision, block:'p-0', quote};
      client.annotationSearch = async () => ({highlights: [{id:'h1', author:'alice', anchor:privateAnchor, text:'Private fixture note', tags:[]}], threads:[]});
      client.exportAnnotations = async () => ({type:'AnnotationPage', items:[]});
      window.holdNext = method => {
        const original = client[method];
        window.requestStarted = false;
        window.requestSettled = false;
        client[method] = async (...args) => {
          client[method] = original;
          window.requestStarted = true;
          try {
            return await new Promise((resolve, reject) => {
              window.releaseRequest = status => status
                ? reject(Object.assign(Error('Synthetic authorization denied'), {status}))
                : resolve(original(...args));
            });
          } finally { window.requestSettled = true; }
        };
      };
      mountAnnotations({client});
    `)});
  });
  await page.goto('/annotation-focus-fixture.html');
  await expect(page.getByText('Signed in as', {exact:false})).toBeVisible();
  await expect.poll(() => page.evaluate(() => CSS.highlights.get('sr-personal')?.size ?? 0)).toBe(1);
});

for (const operation of ['refresh', 'marks', 'search', 'export']) {
  for (const status of [401, 403]) {
    test(`${operation}: delayed ${status} clears private marks after closing`, async ({page}) => {
      if (operation === 'search' || operation === 'export')
        await page.getByRole('button', {name:'Find & export', exact:true}).click();
      const method = operation === 'refresh' ? 'session' : operation === 'export' ? 'exportAnnotations' : 'annotationSearch';
      await page.evaluate(method => window.holdNext(method), method);
      const button = operation === 'search' ? 'Search annotations' : operation === 'export' ? 'Export JSON' : 'Refresh discussion';
      await page.getByRole('button', {name:button, exact:true}).click();
      await expect.poll(() => page.evaluate(() => window.requestStarted)).toBe(true);
      await page.getByRole('button', {name:'Close discussion', exact:true}).click();
      await expect(page.locator('#sr-panel')).toBeHidden();
      await expect.poll(() => page.evaluate(() => CSS.highlights.get('sr-personal')?.size ?? 0)).toBe(1);
      await page.evaluate(status => window.releaseRequest(status), status);
      await expect.poll(() => page.evaluate(() => window.requestSettled)).toBe(true);
      await expect.poll(() => page.evaluate(() => CSS.highlights.get('sr-personal')?.size ?? 0)).toBe(0);
      await expect(page.getByText('Private fixture note', {exact:true})).toHaveCount(0);
      await expect(page.getByText('Signed in as', {exact:false})).toHaveCount(0);
      await expect(page.locator('#sr-entry')).toBeFocused();
    });
  }
}

test('a late successful export after close does not download or clear valid marks', async ({page}) => {
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.getByRole('button', {name:'Find & export', exact:true}).click();
  await page.evaluate(() => window.holdNext('exportAnnotations'));
  await page.getByRole('button', {name:'Export JSON', exact:true}).click();
  await expect.poll(() => page.evaluate(() => window.requestStarted)).toBe(true);
  await page.getByRole('button', {name:'Close discussion', exact:true}).click();
  await page.evaluate(() => window.releaseRequest(0));
  await expect.poll(() => page.evaluate(() => window.requestSettled)).toBe(true);
  await expect(page.locator('#sr-panel')).toBeHidden();
  expect(downloads).toBe(0);
  expect(await page.evaluate(() => CSS.highlights.get('sr-personal')?.size ?? 0)).toBe(1);
});

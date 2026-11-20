import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const site = '/flip-guess/';
const portrait = { width: 393, height: 852 };
const landscape = { width: 852, height: 393 };
const id = (page, name) => page.locator('#' + name);
const continueIds = new Set(['start','landscapeLaunchButton','resumeAction','nextPlayer','restart','setupRestore','launchRestore']);
const tap = async (page, name) => {
  const button=id(page,name);
  if(['showHistory','exportData','importData'].includes(name)&&await id(page,'setupDetails').count()&&await id(page,'setupDetails').isHidden()){
    await expect(id(page,'setup')).toBeVisible();
    const trigger=id(page,'revealSetupDetails');
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await button.tap();
  if(continueIds.has(name))await expect(button).not.toHaveAttribute('data-rebounding','true');
};
const value = (page, name, text) => id(page, name).fill(text);
const inputJSON = (page, name, data) => id(page, name).setInputFiles({
  name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
});
const fetchExport = async (page, button) => {
  const [download] = await Promise.all([page.waitForEvent('download'), tap(page, button)]);
  return JSON.parse(await readFile(await download.path(), 'utf8'));
};
const color = locator => locator.evaluate(element => getComputedStyle(element).color);
const launch = async page => {
  await page.setViewportSize(landscape);
  await tap(page, 'landscapeLaunchButton');
};
const chooseSwipeStyle = async (page, label) => {
  if(await id(page,'setupDetails').isHidden()){
    await id(page,'revealSetupDetails').focus();
    await page.keyboard.press('Enter');
  }
  await page.getByText(label,{exact:true}).tap();
};
const tick = async (page, ms) => { await page.clock.runFor(ms); };
const testDuration = page => page.locator('.durationRow .stepMinus').tap();

test.beforeEach(async ({ page }) => {
  await page.setViewportSize(portrait);
  page.on('pageerror', error => { throw error; });
});

test('team setup, rotation, alternating roles, scoring, undo, podium and restart', async ({ page }) => {
  await page.clock.install();
  await page.goto(site);
  await chooseSwipeStyle(page,'移动单词');
  const category=page.locator('#cats .cat').first();
  const visibleCategories=page.locator('#cats .cat:visible');
  await expect(visibleCategories).toHaveCount(6);
  await expect(page.locator('#cats .cat[inert]:visible')).toHaveCount(2);
  await expect(id(page,'manageWords')).toBeVisible();
  const [selectAll,manage,expand]=await page.locator('#all,#manageWords,#toggleCategories')
    .evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
  expect(manage.height).toBeCloseTo(selectAll.height);
  expect(manage.width).toBeCloseTo(selectAll.width);
  expect(manage.left).toBeGreaterThan(selectAll.right);
  expect(expand.top).toBeGreaterThan(manage.bottom);
  const categoryHeading=await id(page,'categoryHeading').boundingBox();
  const modeHeading=await id(page,'modeHeading').boundingBox();
  const categoryButton=await visibleCategories.first().boundingBox();
  expect(categoryHeading.x).toBeCloseTo(modeHeading.x);
  expect(categoryButton.x).toBeCloseTo(modeHeading.x);
  await tap(page,'toggleCategories');
  expect(await visibleCategories.count()).toBeGreaterThan(6);
  await expect(page.locator('#cats .cat[inert]')).toHaveCount(0);
  await expect(id(page,'manageWords')).toBeVisible();
  await tap(page,'toggleCategories');
  await expect(visibleCategories).toHaveCount(6);
  await expect(page.locator('#cats .cat[inert]:visible')).toHaveCount(2);
  await expect(id(page,'manageWords')).toBeVisible();
  await expect(category).toHaveAttribute('aria-pressed','true');
  await expect(category).toHaveCSS('background-color','rgb(39, 39, 39)');
  await expect(category).toHaveCSS('color','rgb(134, 187, 255)');
  await expect(category).toHaveCSS('border-top-color','rgb(106, 171, 255)');
  await category.tap();
  await expect(category).toHaveAttribute('aria-pressed','false');
  await expect(id(page,'all')).toHaveAttribute('aria-pressed','false');
  await expect(category).toHaveCSS('background-color','rgb(39, 39, 39)');
  await expect(category).toHaveCSS('color','rgb(221, 221, 221)');
  await expect(category).toHaveCSS('border-top-color','rgb(85, 85, 85)');
  await category.tap();
  await expect(id(page,'all')).toHaveAttribute('aria-pressed','true');
  const modes=page.locator('#mode input');
  const modeButtons=page.locator('#mode label');
  await expect(modeButtons.locator('svg')).toHaveCount(2);
  await expect(modeButtons.first().locator('svg')).toHaveCSS('color','rgb(134, 187, 255)');
  await expect(modes.first()).toBeChecked();
  await modeButtons.last().tap();
  await expect(modes.last()).toBeChecked();
  await expect(modeButtons.last().locator('svg')).toHaveCSS('color','rgb(134, 187, 255)');
  await expect(modes.first()).not.toBeChecked();
  await expect(modeButtons.last().locator('span')).toHaveCSS('border-top-color','rgb(106, 171, 255)');
  await expect(id(page,'soloCountWrap')).toBeVisible();
  await modeButtons.first().tap();
  await expect(modes.first()).toBeChecked();
  await expect(modes.last()).not.toBeChecked();
  await page.locator('#teamCountWrap .stepPlus').tap();
  await expect(id(page, 'teamCount')).toHaveValue('3');
  await page.locator('#teamConfig label').last().locator('.stepMinus').tap();
  await expect(page.locator('#teamConfig input').last()).toHaveValue('1');
  const settingsOrder = await page.locator('#setup .config .settingHeading').allTextContents();
  expect(settingsOrder).toEqual(['游戏模式','游戏规则','人数设置']);
  await expect(id(page, 'peopleSettings')).toHaveCSS('background-color', 'rgb(32, 32, 32)');
  const title=page.getByRole('heading',{name:'滑动猜词'});
  await expect(title).toHaveCSS('animation-name','titleSpring');
  await expect(title).toHaveCSS('animation-duration','3s');
  await expect(id(page,'startTop')).toBeDisabled();
  await expect(page.locator('.startStandalone .startRotateIcon')).toHaveText(['↻','↻']);
  const [titleBox,startBox,modeBox]=await Promise.all([title.boundingBox(),id(page,'startTop').boundingBox(),id(page,'modeHeading').boundingBox()]);
  expect(startBox.y).toBeGreaterThan(titleBox.y+titleBox.height);
  expect(modeBox.y).toBeGreaterThan(startBox.y+startBox.height);
  const titleSize=await title.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  expect(titleSize).toBeCloseTo(56.199,2);
  const travel=await title.evaluate(el=>{
    const animation=el.getAnimations()[0];
    animation.pause();
    const positions=[0.17,0.26,0.50,0.75].map(fraction=>{
      animation.currentTime=animation.effect.getTiming().duration*fraction;
      return new DOMMatrix(getComputedStyle(el).transform).m41;
    });
    animation.play();
    return positions;
  });
  expect(Math.min(...travel)).toBeLessThan(-17);
  expect(Math.max(...travel)).toBeGreaterThan(12);
  expect(travel.slice(-2)).toEqual([0,0]);
  const names = ['阿甲', '阿乙', '阿丙', '阿丁', '阿戊'];
  const inputs = page.locator('#nameInputs input');
  for (const [index, name] of ['阿甲','阿丁','阿乙','阿戊','阿丙'].entries()) await inputs.nth(index).fill(name);
  const teams = await Promise.all((await page.locator('.nameGroupHeading').all()).map(color));
  expect(new Set(teams).size).toBe(3);
  for (const [index, team] of teams.entries()) {
    const countLabel=page.locator('#teamConfig label').nth(index);
    await expect(countLabel).toHaveCSS('color', team);
    await expect(countLabel).toHaveCSS('border-left-color', team);
    const card = page.locator('#nameInputs .teamNameGroup').nth(index);
    expect(await card.evaluate(el => {
      const css=getComputedStyle(el);
      return [css.borderTopColor,css.borderRightColor,css.borderBottomColor,css.borderLeftColor];
    })).toEqual([team, team, team, team]);
    await expect(card).toHaveCSS('background-color', 'rgb(32, 32, 32)');
  }
  const firstRow = page.locator('#nameInputs .nameRow').first();
  expect(await firstRow.evaluate(el => [...el.children].map(child => child.className || child.tagName)))
    .toEqual(['namePlayerLabel', 'INPUT', 'nameOrderBadge']);
  await expect(firstRow.locator('.nameOrderBadge')).toHaveCSS('background-color','rgb(255, 255, 255)');
  await testDuration(page);
  await tap(page, 'penalty');
  await page.setViewportSize(landscape);
  await expect(id(page, 'launchDurationValue')).toContainText('3 秒');
  await expect(id(page, 'launchModeValue')).toContainText('3组');
  await expect(id(page, 'launchPenaltyValue')).toHaveText('扣 1 分');
  await expect(id(page, 'landscapeLaunchButton')).toHaveCSS('animation-name','continueBreathe');
  const breath=await id(page,'landscapeLaunchButton').evaluate(el=>el.getAnimations()[0].effect.getKeyframes()[1].clipPath);
  expect(breath).toContain('inset(2% 1.25%');
  await expect(id(page, 'landscapeLaunchButton')).toContainText(/阿丁.*准备描述.*阿甲.*准备猜/s);
  await expect(page.locator('#landscapeLaunchButton .roleAction').first()).toHaveCSS('color', 'rgb(17, 17, 17)');
  expect(await color(page.locator('#landscapeLaunchButton .rolePerson').first())).toBe(teams[0]);
  await page.setViewportSize(portrait);
  await expect(inputs.first()).toHaveValue('阿甲');
  await page.setViewportSize(landscape);
  const launchButton=id(page,'landscapeLaunchButton');
  await launchButton.evaluate(button=>{
    button.click();
    window.launchRebound=button.getAnimations().find(animation=>animation.id==='continue-rebound');
    window.launchRebound?.pause();
  });
  await expect(launchButton).toHaveAttribute('data-rebounding','true');
  const reboundClips=await page.evaluate(()=>window.launchRebound.effect.getKeyframes().map(frame=>frame.clipPath));
  expect(reboundClips[1]).toContain('inset(3% 1.75%');
  expect(reboundClips[2]).toContain('inset(0 ');
  await expect(launchButton).toHaveCSS('animation-name','none');
  await expect(id(page,'game')).toBeHidden();
  await page.evaluate(()=>window.launchRebound.play());
  await expect(launchButton).not.toHaveAttribute('data-rebounding','true');
  await expect(id(page, 'countdownNumber')).toHaveText('3');
  await expect(id(page, 'countdownTitle')).toContainText(/阿丁.*准备描述.*阿甲.*准备猜/s);
  await expect(page.locator('#countdownTitle .roleAction').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(id(page, 'wordHans')).toBeEmpty();
  await tick(page,2250);
  await expect(id(page,'countdownNumber')).toHaveText('1');
  await expect(id(page,'swipeTutorial')).toHaveCount(0);
  await tick(page,830);
  await expect(id(page, 'who')).toHaveText('阿甲猜');
  const hud = await page.locator('#game .hud').boundingBox();
  const undoBounds=await id(page,'undoAction').boundingBox();
  const pauseBounds=await id(page,'pauseAction').boundingBox();
  const buttonGap=pauseBounds.x-undoBounds.x-undoBounds.width;
  const rightInset=landscape.width-pauseBounds.x-pauseBounds.width;
  expect(undoBounds.x).toBeGreaterThan(landscape.width/2);
  expect(Math.abs(buttonGap-landscape.width*.01)).toBeLessThan(.5);
  expect(Math.abs(rightInset-landscape.width*.0185)).toBeLessThan(.5);
  expect(undoBounds.y).toBeCloseTo(pauseBounds.y);
  expect(Math.abs(hud.y-(landscape.height-pauseBounds.y-pauseBounds.height))).toBeLessThan(.5);
  const wordLength=await page.locator('#word > div').evaluateAll(lines=>Math.max(...lines.map(el=>el.textContent.length)));
  if(wordLength<=7)await expect.poll(() => id(page,'wordHans').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(56);
  const wordSizes=await page.locator('#word > div').evaluateAll(lines=>lines.map(el=>getComputedStyle(el).fontSize));
  expect(wordSizes[0]).toBe(wordSizes[1]);
  await expect(page.locator('#who span').first()).toHaveCSS('color', 'rgb(255, 255, 255)');
  const firstWord = await id(page, 'wordHans').textContent();
  expect(firstWord).toBeTruthy();
  await tap(page, 'correct');
  expect(await page.locator('.wordPortalRight .portalShell').evaluate(el=>el.getAnimations().some(a=>a.id==='portal-pulse'))).toBe(true);
  const ignoredTapsLeaveMotionRunning=await id(page,'game').evaluate(game=>{
    const motion=game.getAnimations({subtree:true}).find(animation=>animation.id==='word-absorption');
    for(const [id,x] of [['correct',700],['pass',150]]){
      const side=document.getElementById(id);
      side.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:0,clientX:x}));
      side.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1,clientX:x}));
    }
    return game.getAnimations({subtree:true}).includes(motion);
  });
  expect(ignoredTapsLeaveMotionRunning).toBe(true);
  await expect(id(page, 'score')).toHaveText('1 分');
  await expect(id(page,'scoreChange')).toHaveText('+1');
  await expect(id(page,'scoreChange')).toHaveCSS('color','rgb(133, 197, 255)');
  expect(await page.locator('#correct .tapFeedback').evaluate(el=>el.getAnimations().length)).toBe(0);
  expect(await id(page, 'wordHans').textContent()).not.toBe(firstWord);
  await tick(page, 280);
  await tap(page, 'pass');
  await expect(id(page, 'score')).toHaveText('0 分');
  await expect(id(page,'scoreChange')).toHaveText('−1');
  await expect(id(page,'scoreChange')).toHaveCSS('color','rgb(255, 144, 155)');
  await tap(page, 'undoAction');
  await expect(page.locator('.wordInTransit')).toHaveCount(2);
  expect(await id(page,'undoAction').evaluate(el=>el.getAnimations().length)).toBe(1);
  await expect(id(page, 'score')).toHaveText('1 分');
  await page.setViewportSize(portrait);
  await expect(id(page, 'rotateNotice')).toBeVisible();
  await expect(id(page, 'portraitProgressCount')).toHaveText('已完成 0 / 5 人');
  await page.setViewportSize(landscape);
  await expect(id(page, 'pauseOverlay')).toBeVisible();
  await expect(id(page,'resumeAction')).toHaveCSS('animation-name','continueBreathe');
  const resumeBox=await id(page,'resumeAction').boundingBox();
  const endBox=await id(page,'restartRoundAction').boundingBox();
  expect(endBox.y).toBe(resumeBox.y);
  expect(endBox.width).toBe(resumeBox.width);
  expect(resumeBox.width).toBeGreaterThan(140);
  await tick(page, 1000);
  await expect(id(page, 'pauseOverlay')).toBeVisible();
  await tap(page, 'resumeAction');
  await expect(id(page, 'wordHans')).toBeHidden();
  await tick(page,2250);
  await tick(page,3850);
  await expect(id(page, 'roundScore')).toHaveText('1 分');
  await expect(page.locator('#roundDetail .detailOrder')).toHaveText('1');
  await expect(page.locator('#roundDetail .isCorrect')).toHaveText(new RegExp(RegExp.escape(firstWord)));
  for (const [index, name] of names.entries()) {
    await expect(id(page, 'roundTitle')).toHaveText(name + ' 完成');
    expect(await color(id(page, 'roundTitle'))).toBe(teams[index % 3]);
    if (index === 0) await expect(id(page, 'nextPlayer')).toContainText(/阿戊.*准备描述.*阿乙.*准备猜/s);
    if (index === 2) await expect(id(page, 'nextPlayer')).toContainText(/阿甲.*准备描述.*阿丁.*准备猜/s);
    await tap(page, 'nextPlayer');
    if (index < names.length - 1) {
      if (index === 0) {
        await page.setViewportSize(portrait);
        await expect(id(page, 'rotateNotice')).toBeVisible();
        await expect(id(page, 'portraitProgressCount')).toHaveText('已完成 1 / 5 人');
        expect(await color(page.locator('.portraitProgressName'))).toBe(teams[0]);
        await page.setViewportSize(landscape);
        await tap(page, 'resumeAction');
      }
      await tick(page, 6150);
    }
  }
  await expect(id(page, 'podiumReveal')).toBeVisible();
  await expect(page.locator('.podiumBar')).toHaveCount(3);
  await expect(id(page,'podiumLabels').locator('span')).toHaveCount(3);
  await expect(id(page, 'winner')).toBeEmpty();
  await expect(page.locator('.first .podiumScore')).toBeHidden();
  await expect(id(page, 'restart')).toBeHidden();
  await expect(id(page, 'winner')).toHaveText('A组 获胜');
  await expect(id(page,'restart')).toHaveCSS('animation-name','continueBreathe');
  await expect(id(page, 'podiumReveal')).toBeHidden();
  await expect(page.locator('.first').getByRole('img',{name:'冠军'})).toBeVisible();
  await expect(page.locator('.first .podiumPlace')).toHaveCount(0);
  await expect(page.locator('.second .podiumScore')).toBeVisible();
  const [secondCard,thirdCard]=await page.locator('.second .podiumCard,.third .podiumCard')
    .evaluateAll(cards=>cards.map(card=>card.getBoundingClientRect().toJSON()));
  expect(secondCard.height).toBeCloseTo(thirdCard.height);
  expect(secondCard.y).toBeCloseTo(thirdCard.y);
  await expect(id(page,'finalSubtitle')).toContainText('按各组平均分排名');
  await expect(page.locator('.first .podiumScore')).toHaveText('0.5 均分');
  await expect(page.locator('#celebration .confettiBurst')).toHaveCount(4);
  await expect(page.locator('#celebration .confettiBurst i')).toHaveCount(88);
  await expect(page.locator('#celebration .confettiBurst i').first()).toHaveCSS('animation-name','confettiPop');
  await expect(page.locator('.podiumTop > :nth-child(2) .podiumName')).toHaveText('A组');
  await expect(page.locator('.podiumCard')).toHaveCount(3);
  await expect(page.locator('.first .podiumName')).toHaveCSS('background-color',teams[0]);
  await expect(page.locator('.first .podiumCard')).toHaveCSS('border-top-color','rgb(240, 198, 104)');
  const finalBounds = await id(page, 'final').evaluate(el => {
    const css = getComputedStyle(el);
    return [parseFloat(css.paddingLeft), parseFloat(css.paddingRight)];
  });
  expect(finalBounds.every(n => n >= 76)).toBe(true);
  const heights = await page.locator('.finalActions button').evaluateAll(buttons => buttons.map(b => b.offsetHeight));
  expect(new Set(heights).size).toBe(1);
  const backup = await fetchExport(page, 'finalExport');
  expect(backup.matches[0].scoring).toBe('average');
  expect(backup.matches[0].results.map(r => r.label)).toEqual(names);
  expect(backup.matches[0].results.map(r => r.score)).toEqual([1, 0, 0, 0, 0]);
  expect(backup.seen.length).toBeGreaterThanOrEqual(5);
  await tap(page, 'restart');
  await page.setViewportSize(portrait);
  await expect(id(page, 'historyInfo')).toContainText('历史 1 局');
  const nextTeamColor=await color(page.locator('.nameGroupHeading').first());
  await expect(page.locator('#teamConfig label').first()).toHaveCSS('color', nextTeamColor);
  await expect(page.locator('#teamConfig label').first()).toHaveCSS('border-left-color', nextTeamColor);
  await launch(page);
  await expect(id(page, 'score')).toHaveText('0 分');
  await expect(page.locator('#countdownTitle .rolePerson').first()).toHaveCSS('color', nextTeamColor);
  await tick(page, 3080);
  await tap(page, 'pauseAction');
  const pauseButton=await id(page,'restartRoundAction').boundingBox();
  await tap(page, 'restartRoundAction');
  const endButton=await id(page,'endConfirm').boundingBox();
  expect(Math.abs(endButton.y-pauseButton.y)).toBeLessThan(.5);
  expect(endButton.width).toBeCloseTo(pauseButton.width);
  await expect(page.locator('#pauseOverlay .confirmPanel p')).toHaveCount(0);
  await expect(page.locator('#endDialog .confirmPanel > :last-child')).toHaveText('返回主页，本局将记为中断。');
  await tap(page, 'endCancel');
  await expect(id(page, 'pauseOverlay')).toBeVisible();
  await page.setViewportSize(portrait);
  await expect(id(page,'portraitEnd')).toBeVisible();
  await tap(page,'portraitEnd');
  await expect(id(page,'endDialog')).toBeVisible();
  await expect(id(page,'endDialog')).toHaveCSS('background-color','rgb(165, 43, 54)');
  await expect(id(page,'endConfirm')).toHaveCSS('background-color','rgb(255, 255, 255)');
  const cancelBounds=await id(page,'endCancel').boundingBox();
  const confirmBounds=await id(page,'endConfirm').boundingBox();
  expect(confirmBounds.y).toBeGreaterThan(cancelBounds.y+cancelBounds.height);
  expect(cancelBounds.width).toBeCloseTo(confirmBounds.width);

  await tap(page,'endConfirm');
  await expect(id(page,'setup')).toBeVisible();
  await tick(page, 7000);
  await expect(id(page, 'game')).toBeHidden();
  expect((await fetchExport(page, 'exportData')).roundAudit[0].event).toBe('game_ended');
  await page.reload();
  await expect(id(page, 'historyInfo')).toContainText('历史 1 局');
  const reloadedTeamColor=await color(page.locator('.nameGroupHeading').first());
  await expect(page.locator('#teamConfig label').first()).toHaveCSS('color', reloadedTeamColor);
});

test('word manager touch controls, normalized deduplication, deletion, reload and export', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedPrompt = text; } } });
  });
  await page.goto(site);
  await tap(page, 'manageWords');
  await expect(id(page,'wmBack')).toHaveText('返回主页');
  await tap(page, 'wmPrompt');
  await expect(id(page, 'messageText')).toHaveText('已复制 AI 扩词提示词');
  expect(await page.evaluate(() => window.copiedPrompt)).toContain('flip-guess-wordbank');
  await tap(page, 'messageClose');
  expect(await page.locator('.wmBrowse').evaluate(el => el.offsetTop > el.previousElementSibling.offsetTop + el.previousElementSibling.offsetHeight)).toBe(true);
  await tap(page, 'wmNewCategory');
  const [nameField,createButton,cancelButton]=await page.locator('.wmCreateInputs > *')
    .evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().toJSON()));
  expect(createButton.top).toBeGreaterThan(nameField.bottom);
  expect(createButton.top).toBeCloseTo(cancelButton.top);
  expect(createButton.width).toBeCloseTo(cancelButton.width);
  await value(page, 'wmCategoryName', '派对测试');
  await tap(page, 'wmCreateConfirm');
  await expect(id(page, 'wmCategory')).toHaveValue('派对测试');
  await value(page, 'wmHans', '自定义词');
  await tap(page, 'wmAddWord');
  await value(page, 'wmHans', '测试飞龙');
  await value(page, 'wmHant', '測試飛龍');
  await tap(page, 'wmAddWord');
  await expect(id(page,'wmSearchClear')).toBeHidden();
  await value(page, 'wmSearch', '測試飛龍');
  await expect(page.locator('.wmItem')).toHaveCount(1);
  await tap(page,'wmSearchClear');
  await expect(id(page,'wmSearch')).toHaveValue('');
  await expect(id(page,'wmSearchClear')).toBeHidden();
  await expect(page.locator('.wmItem')).toHaveCount(2);
  const file = { format: 'flip-guess-wordbank', version: 1, categories: [
    { name: '其它', words: [{ simplified: '　自定义词　' }, { simplified: 'ＡＢＣ' }, { simplified: 'ABC' }] },
    { name: '__proto__', words: [{ simplified: '保留类别名' }] },
  ] };
  await inputJSON(page, 'wmFile', file);
  await expect(page.getByRole('dialog',{name:'导入词库？'})).toBeVisible();
  await expect(id(page,'wmConfirm')).toHaveCSS('background-color','rgb(0, 0, 0)');
  await expect(id(page, 'wmConfirmText')).toContainText('跳过 2 个重复词');
  await tap(page, 'wmConfirmYes');
  await value(page,'wmSearch','測試飛龍');
  await page.locator('.wmItem button').tap();
  await expect(id(page,'wmConfirm')).toHaveCSS('background-color','rgb(165, 43, 54)');
  await tap(page, 'wmConfirmYes');
  await expect(page.locator('.wmItem')).toHaveCount(0);
  await page.reload();
  await tap(page, 'manageWords');
  const exported = await fetchExport(page, 'wmExport');
  expect(exported.categories.find(c => c.name === '派对测试').words).toEqual([{ simplified: '自定义词', traditional: '自定义词' }]);
  expect(exported.categories.find(c => c.name === '其它').words).toEqual([{ simplified: 'ABC', traditional: 'ABC' }]);
  expect(exported.categories.find(c => c.name === '__proto__').words).toHaveLength(1);
  await inputJSON(page, 'wmFile', exported);
  await expect(id(page, 'wmConfirmText')).toContainText('将新增 0 个词、0 个类别');
  await tap(page, 'wmConfirmYes');
});

test('real v59 exports restore history, interruptions and custom words in a fresh browser context', async ({ page, browser, request }) => {
  const legacy = await request.get('/legacy.html');
  test.skip(legacy.status() === 404, 'Original v59 HTML is kept outside Git');
  await page.clock.install();
  await page.goto('/legacy.html');
  await id(page, 'mode').selectOption('solo');
  await page.locator('#soloCountWrap .stepMinus').tap();
  await page.locator('#soloCountWrap .stepMinus').tap();
  await page.locator('#soloCountWrap .stepMinus').tap();
  await testDuration(page);
  await launch(page);
  await tick(page, 3080);
  await tap(page, 'correct');
  await tick(page, 3110);
  await tap(page, 'nextPlayer');
  await tap(page, 'restart');
  await launch(page);
  await tick(page, 3080);
  await tap(page, 'pauseAction');
  await tap(page, 'restartRoundAction');
  await tap(page, 'endConfirm');
  await page.setViewportSize(portrait);
  const oldProgress = await fetchExport(page, 'exportData');
  expect(oldProgress.matches).toHaveLength(1);
  expect(oldProgress.roundAudit).toHaveLength(1);
  await tap(page, 'manageWords');
  await tap(page, 'wmNewCategory');
  await value(page, 'wmCategoryName', '旧版词库样例');
  await tap(page, 'wmCreateConfirm');
  await value(page, 'wmHans', '迁移测试飞龙');
  await value(page, 'wmHant', '遷移測試飛龍');
  await tap(page, 'wmAddWord');
  const oldWords = await fetchExport(page, 'wmExport');

  const context = await browser.newContext({ viewport: portrait, hasTouch: true, isMobile: true });
  try {
    const restored = await context.newPage();
    await restored.goto('http://127.0.0.1:4173' + site);
    await inputJSON(restored, 'importFile', oldProgress);
    await tap(restored, 'confirmImport');
    await tap(restored, 'messageClose');
    await tap(restored, 'manageWords');
    await inputJSON(restored, 'wmFile', oldWords);
    await tap(restored, 'wmConfirmYes');
    await restored.reload();
    const newProgress = await fetchExport(restored, 'exportData');
    expect(newProgress.matches).toEqual(oldProgress.matches);
    expect(newProgress.roundAudit).toEqual(oldProgress.roundAudit);
    expect(newProgress.seen.map(w => w.id).sort()).toEqual(oldProgress.seen.map(w => w.id).sort());
    await inputJSON(restored, 'importFile', newProgress);
    await expect(id(restored, 'importSummary')).toContainText('新增对局：0');
    await tap(restored, 'cancelImport');
    await tap(restored, 'manageWords');
    const newWords = await fetchExport(restored, 'wmExport');
    expect(newWords.categories).toEqual(oldWords.categories);
  } finally {
    await context.close();
  }
});

test('audio cues and timeout reveal follow the existing clock', async ({ page }) => {
  await page.addInitScript(() => {
    window.audioEvents = [];
    window.tickSeconds = [];
    window.hapticEvents = [];
    Object.defineProperty(navigator, 'vibrate', {
      value: pattern => { window.hapticEvents.push(pattern); return true; },
    });
    const param = { setValueAtTime(n) { this.value = n; }, exponentialRampToValueAtTime() {} };
    window.AudioContext = class {
      state = 'running';
      currentTime = 0;
      destination = {};
      createGain() { return { gain: { ...param }, connect() {} }; }
      createOscillator() {
        return { frequency: { ...param }, start() {
          window.audioEvents.push(this.frequency.value);
          if(this.frequency.value===950)window.tickSeconds.push(Number(document.getElementById('timer').textContent.split(':')[1]));
        }, connect() {}, stop() {} };
      }
    };
  });
  await page.clock.install();
  await page.goto(site);
  await page.locator('#mode label').last().tap();
  for (let index=0;index<3;index++) await page.locator('#soloCountWrap .stepMinus').tap();
  await launch(page);
  expect(await page.evaluate(() => window.audioEvents)).toEqual([]);
  expect(await id(page, 'countdownNumber').evaluate(el => el.getAnimations().length)).toBe(1);
  await tick(page, 1050);
  await expect(id(page, 'countdownNumber')).toHaveText('2');
  await tick(page, 2030);
  await tap(page, 'correct');
  await tick(page, 300);
  await tap(page, 'pass');
  expect(await page.evaluate(() => window.audioEvents)).toEqual([660, 660, 540, 800, 523.25, 784, 165, 126]);
  expect(await page.evaluate(() => window.hapticEvents)).toEqual([35]);
  await tap(page,'undoAction');
  expect(await page.evaluate(()=>window.audioEvents.slice(-2))).toEqual([1040,510]);
  await tick(page,280);
  await tap(page,'pass');
  const hud=page.locator('#game .hud');
  const regularBounds=await hud.boundingBox();
  await expect(id(page,'timer')).toHaveCSS('color','rgb(84, 230, 139)');
  await tick(page,await page.evaluate(()=>Math.round(deadline-performance.now()-14_900)));
  await expect(id(page, 'timer')).toHaveText('0:15');
  await expect(hud).toHaveClass(/urgent/);
  await expect.poll(async()=>Math.round((await hud.boundingBox()).height/regularBounds.height*100)).toBe(150);
  expect((await hud.boundingBox()).y).toBe(regularBounds.y);
  const urgentBounds=await hud.boundingBox();
  expect(urgentBounds.width).toBeGreaterThan(regularBounds.width+30);
  expect(Math.abs((urgentBounds.x+urgentBounds.width/2)-(regularBounds.x+regularBounds.width/2))).toBeLessThan(1);
  const edgeDifference=await hud.evaluate(frame=>{
    const bounds=frame.getBoundingClientRect();
    const name=frame.querySelector('#who').getBoundingClientRect();
    const score=frame.querySelector('#score').getBoundingClientRect();
    return Math.abs((name.left-bounds.left)-(bounds.right-score.right));
  });
  expect(edgeDifference).toBeLessThan(1);
  const wordBounds=await id(page,'word').boundingBox();
  expect(wordBounds.y).toBeGreaterThan(urgentBounds.y+urgentBounds.height+6);
  expect((wordBounds.y+wordBounds.height/2)/landscape.height).toBeCloseTo(.525,2);
  const peak=await id(page,'timer').evaluate(el=>{
    const pulse=el.getAnimations()[0];
    pulse.pause();
    const colors=pulse.effect.getKeyframes().map(frame=>frame.color);
    const nameNode=document.getElementById('who');
    const scoreNode=document.getElementById('score').parentElement;
    const baseLeft=nameNode.getBoundingClientRect().left;
    const baseRight=scoreNode.getBoundingClientRect().left;
    const baseFont=getComputedStyle(nameNode).fontSize;
    pulse.currentTime=pulse.effect.getTiming().duration/2;
    const rect=el.getBoundingClientRect();
    const frame=el.parentElement.getBoundingClientRect();
    const name=document.getElementById('who').getBoundingClientRect();
    const points=document.getElementById('score').getBoundingClientRect();
    const matrix=new DOMMatrix(getComputedStyle(el).transform);
    const result={colors,nameMove:nameNode.getBoundingClientRect().left-baseLeft,scoreMove:scoreNode.getBoundingClientRect().left-baseRight,font:getComputedStyle(nameNode).fontSize,baseFont,scale:matrix.a,verticalScale:matrix.d,top:rect.top-frame.top,bottom:frame.bottom-rect.bottom,
      centerOffsets:[name,rect,points].map(box=>Math.abs(box.top+box.height/2-frame.top-frame.height/2)),
      nameGap:rect.left-name.right,scoreGap:points.left-rect.right};
    pulse.play();
    return result;
  });
  expect(peak.colors).toEqual(['rgb(213, 30, 50)','rgb(255, 53, 67)','rgb(213, 30, 50)']);
  expect(peak.nameMove).toBe(0);
  expect(peak.scoreMove).toBe(0);
  await expect(id(page,'timer')).not.toHaveClass(/timer-swing/);
  expect(peak.font).toBe(peak.baseFont);
  expect(Math.max(...peak.centerOffsets)).toBeLessThan(1);
  expect(peak.scale).toBeGreaterThan(1.48);
  expect(peak.verticalScale).toBeCloseTo(peak.scale,5);
  expect(Math.min(peak.top,peak.bottom,peak.nameGap,peak.scoreGap)).toBeGreaterThan(1);
  expect(Math.abs(peak.nameGap-peak.scoreGap)).toBeLessThan(2);
  await expect(id(page,'who')).toHaveCSS('text-align','center');
  await tick(page,await page.evaluate(()=>Math.round(deadline-performance.now()-4_900)));
  await expect(id(page,'timer')).toHaveText('0:05');
  await expect(id(page,'timer')).toHaveClass(/timer-swing/);
  const swing=await id(page,'timer').evaluate(timer=>{
    const pulse=timer.getAnimations().find(animation=>animation.animationName==='timerUrgentPulse');
    const swing=timer.getAnimations().find(animation=>animation.animationName==='timerSwing');
    pulse.pause();
    swing.pause();
    pulse.currentTime=pulse.effect.getTiming().duration/2;
    const duration=swing.effect.getTiming().duration;
    const frame=timer.parentElement.getBoundingClientRect();
    const name=document.getElementById('who').getBoundingClientRect();
    const points=document.getElementById('score').parentElement.getBoundingClientRect();
    const peaks=[.25,.75].map(fraction=>{
      swing.currentTime=duration*fraction;
      const rect=timer.getBoundingClientRect();
      return {angle:getComputedStyle(timer).rotate,
        clearance:Math.min(rect.top-frame.top,frame.bottom-rect.bottom,rect.left-name.right,points.left-rect.right)};
    });
    pulse.play();
    swing.play();
    return {duration,peaks};
  });
  expect(swing.duration).toBe(240);
  expect(swing.peaks.map(peak=>peak.angle)).toEqual(['12deg','-12deg']);
  expect(Math.min(...swing.peaks.map(peak=>peak.clearance))).toBeGreaterThan(1);
  await tap(page, 'pauseAction');
  const ticksAtPause=await page.evaluate(()=>window.tickSeconds.length);
  await tick(page, 2000);
  expect(await page.evaluate(()=>window.tickSeconds.length)).toBe(ticksAtPause);
  await tap(page, 'resumeAction');
  await tick(page, 20_000);
  await expect(id(page,'roundTransition')).toBeVisible();
  await expect(id(page,'game')).toBeVisible();
  await expect(id(page,'timer')).toHaveText('0:00');
  await expect(id(page,'timer')).toHaveClass(/timer-warning/);
  await expect(page.locator('.roundBurstTime')).toHaveCount(0);
  expect(await page.evaluate(() => window.audioEvents.slice(-2))).toEqual([468,326]);
  await expect(id(page,'between')).toBeHidden();
  await expect(id(page,'roundTransition')).toHaveCSS('background-color','rgb(0, 0, 0)');
  await expect(id(page,'between')).toBeVisible();
  await expect(id(page,'roundTransition')).toBeHidden();
  await expect(id(page,'roundScore')).toHaveText('1 分');
  await expect(id(page,'roundScore')).toHaveCSS('animation-name','roundScoreIn');
  const ordered=page.locator('#roundDetail .detailOrder');
  await expect(ordered).toHaveText(['1','2']);
  await expect(ordered.first()).toHaveCSS('color','rgb(29, 100, 175)');
  await expect(ordered.last()).toHaveCSS('color','rgb(165, 40, 54)');
  await page.getByRole('button',{name:'只看跳过'}).tap();
  await expect(ordered).toHaveText(['2']);
  const slowOrder=await page.evaluate(()=>roundWords.map((word,index)=>({index,ms:word.elapsedMs}))
    .sort((a,b)=>b.ms-a.ms).map(item=>String(item.index+1)));
  await page.getByRole('button',{name:'用时最长'}).tap();
  await expect(ordered).toHaveText(slowOrder);
  await page.getByRole('button',{name:'全部',exact:true}).tap();
  await expect(ordered).toHaveText(['1','2']);
  const tickSeconds=await page.evaluate(() => window.tickSeconds);
  expect(tickSeconds).toEqual([
    15,14,13,12,11,10,9,8,7,6,
    5,5,5,5,4,4,4,4,3,3,3,3,2,2,2,2,1,1,1,1,
  ]);
  const haptics = await page.evaluate(() => window.hapticEvents);
  expect(haptics.filter(pattern => Array.isArray(pattern) && pattern.length === 5))
    .toEqual(Array.from({ length: 15 }, () => [24,36,24,36,24]));
  expect(haptics).toContain(0);
  await tap(page, 'nextPlayer');
  await expect.poll(() => page.evaluate(() => window.hapticEvents.at(-1)))
    .toEqual([32,26,30,25,32,22,42,28,54,33,77]);
  expect(await page.evaluate(() => window.audioEvents.slice(-19))).toEqual(
    [73.42,146.83,220,293.66,220,369.99,98,196,392,493.88,73.42,146.83,293.66,369.99,440,587.33,739.99,880,1174.66],
  );
});

test('word timings exclude pause and keep only the restored word time on undo', async ({page})=>{
  await page.clock.install();
  await page.goto(site);
  await launch(page);
  await tick(page,3500);
  await tap(page,'pauseAction');
  await tick(page,6000);
  await tap(page,'resumeAction');
  await tick(page,3350);
  await tap(page,'correct');
  const first=await page.evaluate(()=>roundWords[0].elapsedMs);
  expect(first).toBeGreaterThan(650);
  expect(first).toBeLessThan(2000);
  await tick(page,1800);
  await tap(page,'undoAction');
  await tick(page,400);
  await tap(page,'pass');
  const updated=await page.evaluate(()=>roundWords[0].elapsedMs);
  expect(updated-first).toBeGreaterThanOrEqual(400);
  expect(updated-first).toBeLessThan(900);
  await tick(page,await page.evaluate(()=>Math.ceil(deadline-performance.now()+300)));
  const row=page.locator('#roundDetail .roundWordRow');
  await expect(row).toHaveCount(1);
  await expect(row.locator('.roundWordTime')).toHaveText((updated/1000).toFixed(1)+' 秒');
  await expect(row.locator(".roundWordBar")).toBeVisible();
  expect((await row.locator('.roundWordBar').boundingBox()).width).toBeGreaterThan(25);
  await expect(row.locator('.detailOrder')).toHaveCSS('border-top-color','rgb(165, 40, 54)');
});

test('storage refusal leaves word edits and merged records uncommitted', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException('test', 'QuotaExceededError'); };
  });
  await page.goto(site);
  await tap(page, 'manageWords');
  await tap(page, 'wmNewCategory');
  await value(page, 'wmCategoryName', '存储失败样例');
  await tap(page, 'wmCreateConfirm');
  await expect(id(page, 'wmStatus')).toContainText('无法保存词库');
  await expect(id(page, 'wmCategory').locator('option[value="存储失败样例"]')).toHaveCount(0);
  await tap(page, 'wmBack');
  await inputJSON(page, 'importFile', { format: 'cross-strait-charades-progress', version: 1, seen: [{simplified:'测试'}] });
  await tap(page, 'confirmImport');
  await expect(id(page, 'messageText')).toContainText('无法保存导入记录');
  await expect(id(page, 'storageStatus')).toBeVisible();
  expect(await page.evaluate(() => DATA.seen.size)).toBe(0);
});

test('project subpath, offline relaunch, failed update and safe activation', async ({ page, context, request }) => {
  const release = async name => { await request.post('/__release/' + name); };
  await release('original');
  try {
    await page.goto(site);
    await expect(id(page, 'offlineStatus')).toHaveText('离线资源已就绪。');
    const manifestResponse = await request.get(site + 'manifest.webmanifest');
    const manifest = await manifestResponse.json();
    expect(manifest.display).toBe('standalone');
    expect(new URL(manifest.start_url, manifestResponse.url()).pathname).toBe(site);
    expect(new URL(manifest.scope, manifestResponse.url()).pathname).toBe(site);
    for (const icon of manifest.icons) {
      const png = await (await request.get(site + icon.src.slice(2))).body();
      const size = Number(icon.sizes.split('x')[0]);
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([size,size]);
    }
    await tap(page, 'manageWords');
    await tap(page, 'wmNewCategory');
    await value(page, 'wmCategoryName', '离线保留');
    await tap(page, 'wmCreateConfirm');
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const keys = () => page.evaluate(() => caches.keys());
    const previous = await keys();
    await release('offline');
    await page.goto(site + '?offline');
    await expect(id(page, 'setup')).toBeVisible();
    await tap(page,'toggleCategories');
    await expect(page.locator('#cats').getByText('离线保留')).toBeVisible();
    const iconLoaded = await page.evaluate(async () => (await fetch('./assets/apple-touch-icon.png')).ok);
    expect(iconLoaded).toBe(true);
    await release('broken');
    const rejected = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const result = new Promise(resolve => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          sw?.addEventListener('statechange', () => {
            if (sw.state === 'redundant' || sw.state === 'installed') resolve(sw.state);
          });
        }, { once: true });
      });
      await reg.update();
      return result;
    });
    expect(rejected).toBe('redundant');
    expect(await keys()).toEqual(previous);
    await release('updated');
    await launch(page);
    await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true);
    await expect(id(page, 'game')).toBeVisible();
    await expect(page.locator('meta[name="test-release"]')).toHaveCount(0);
    // Observe activation from a same-origin page outside the worker scope.
    const observer = await context.newPage();
    await observer.goto('/health');
    await page.close();
    await expect.poll(() => observer.evaluate(async () =>
      (await caches.keys()).some(key => key.endsWith('test-release-2')) && (await caches.keys()).length === 1)).toBe(true);
    await release('offline');
    await observer.goto(site);
    await expect(observer.locator('meta[name="test-release"]')).toHaveAttribute('content', '2');
    await observer.locator('#toggleCategories').click();
    await expect(observer.locator('#cats').getByText('离线保留')).toBeVisible();
  } finally {
    await release('original');
  }
});

test('reduced motion keeps scores visible and result image downloads', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'canShare', {value: () => false});
  });
  await page.clock.install();
  await page.goto(site);
  await page.locator('#mode label').last().tap();
  for (let i = 0; i < 3; i++) await page.locator('#soloCountWrap .stepMinus').tap();
  await testDuration(page);
  await page.setViewportSize(landscape);
  await expect(id(page,'landscapeLaunchButton')).toHaveCSS('animation-name','none');
  await launch(page);
  expect(await id(page, 'countdownNumber').evaluate(el => el.getAnimations().length)).toBe(0);
  await tick(page, 6150);
  await expect(id(page, 'roundScore')).toHaveCSS('opacity', '1');
  await expect(id(page,'roundTransition')).toBeHidden();
  await tap(page, 'nextPlayer');
  await expect(id(page, 'podiumReveal')).toBeHidden();
  await expect(page.locator('.celebrationBurst')).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent('download'), tap(page, 'shareResult')]);
  const png = await readFile(await download.path());
  expect(png.subarray(1,4).toString()).toBe('PNG');
  expect(png.readUInt32BE(20)).toBeGreaterThan(png.readUInt32BE(16));
  await tap(page, 'restart');
  await page.setViewportSize(portrait);
  await page.reload();
  await expect(id(page,'historyInfo')).toContainText('历史 1 局');
  await tap(page, 'showHistory');
  await expect(page.getByRole('region',{name:'备份与迁移'}).getByRole('button')).toHaveCount(2);
  await expect(page.getByRole('region',{name:'清理记录'}).getByRole('button')).toHaveCount(2);
  await expect(page.locator('.historyHeader #backSetup')).toHaveText('返回主页');
  await tap(page, 'resetSeen');
  await tap(page, 'resetCancel');
  await expect(id(page, 'historyStats')).toContainText('已出现 1');
  await tap(page, 'resetSeen');
  await tap(page, 'resetConfirm');
  await expect(id(page, 'historyStats')).toContainText(/^已出现 0.*历史 1 局$/);
  await tap(page, 'resetHistory');
  await tap(page, 'resetConfirm');
  await expect(id(page, 'historyStats')).toContainText('历史 0 局');
});

test('turn-order buttons swap teammates between matches without moving slots', async ({ page }) => {
  await page.clock.install();
  await page.goto(site);
  await page.locator('#teamCountWrap .stepPlus').tap();
  const nicknames=['小安','小白','小陈','小杜','小方','小顾'];
  const inputs=page.locator('#nameInputs input');
  for(const [index,nickname] of nicknames.entries())await inputs.nth(index).fill(nickname);
  await testDuration(page);
  await launch(page);
  await tick(page,3080);
  await tap(page,'correct');
  for(let index=0;index<6;index++){
    await tick(page,6150);
    await tap(page,'nextPlayer');
  }
  await expect(id(page,'finalSubtitle')).toContainText('按各组总分排名');
  await expect(page.locator('.first .podiumScore')).toHaveText('1 分');
  await tap(page,'restart');
  await page.setViewportSize(portrait);
  const buttons=page.locator('#nameInputs button.nameOrderBadge');
  const first=buttons.first(),second=buttons.last();
  const order=await buttons.allTextContents();
  await first.tap();
  await expect(first).toHaveAttribute('aria-pressed','true');
  await expect(first).toHaveCSS('background-color','rgb(35, 119, 232)');
  await expect(first).toHaveCSS('border-top-color','rgb(255, 255, 255)');
  await first.tap();
  await expect(first).toHaveAttribute('aria-pressed','false');
  await expect(inputs.first()).toHaveValue('小安');
  await first.tap();
  await second.tap();
  await expect(first).toHaveAttribute('aria-pressed','false');
  await expect(second).toHaveAttribute('aria-pressed','false');
  await expect(inputs.first()).toHaveValue('小顾');
  await expect(inputs.last()).toHaveValue('小安');
  expect(await buttons.allTextContents()).toEqual(order);
  await launch(page);
  await expect(id(page,'countdownTitle')).toContainText(/小白.*准备描述.*小顾.*准备猜/s);
});


test('nickname editing keeps the setup within a narrow portrait viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(site);
  const setup=id(page,'setup');
  const nickname=page.locator('#nameInputs input').last();
  await nickname.tap();
  await expect(nickname).toBeFocused();
  await expect(nickname).toHaveCSS('font-size','16px');
  await nickname.fill('用于检查较长昵称能否正确显示的小测试');
  await page.setViewportSize({ width: 320, height: 460 });
  await expect(nickname).toHaveValue('用于检查较长昵称能否正确显示的小测试');
  await nickname.blur();
  await page.setViewportSize({ width: 320, height: 640 });
  const geometry=await setup.evaluate(el=>{
    el.scrollTop=0;
    const title=el.querySelector('h1').getBoundingClientRect();
    return {
      left:el.getBoundingClientRect().left, width:el.clientWidth, scrollWidth:el.scrollWidth,
      titleTop:title.top, titleLeft:title.left, titleRight:title.right, scrollX:window.scrollX,
    };
  });
  expect(geometry.left).toBe(0);
  expect(geometry.width).toBe(geometry.scrollWidth);
  expect(geometry.scrollX).toBe(0);
  expect(geometry.titleTop).toBeGreaterThan(22);
  expect(geometry.titleLeft).toBeGreaterThanOrEqual(15);
  expect(geometry.titleRight).toBeLessThanOrEqual(305);
  await expect(setup).toHaveCSS('padding-bottom','12px');
  await expect(id(page,'dataNotice')).toBeHidden();
  await id(page,'revealSetupDetails').press('Enter');
  await setup.evaluate(el=>{el.scrollTop=el.scrollHeight});
  await expect(id(page,'dataNotice')).toBeInViewport();
});


test('portrait results fill the middle and scroll additional teams above fixed actions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.goto(site);
  const render=async count=>page.evaluate(async n=>{
    mode='team';
    players=Array.from({length:n},(_,index)=>({team:String.fromCharCode(65+index)+'组'}));
    results=players.map(({team},index)=>({team,label:'选手'+(index+1),score:n-index}));
    await showFinal();
  },count);
  const cards=id(page,'finalCards');
  const actions=page.locator('#final .finalActions');
  await render(3);
  const geometry=await cards.evaluate(el=>{
    const card=el.querySelector('.first .podiumCard').getBoundingClientRect();
    const winner=document.querySelector('#winner').getBoundingClientRect();
    const buttons=document.querySelector('.finalActions').getBoundingClientRect();
    const restart=document.querySelector('#restart').getBoundingClientRect();
    return {winnerTop:winner.top,championTop:card.top,cardsTop:el.getBoundingClientRect().top,
      buttonsWidth:buttons.width,restartWidth:restart.width,restartTop:restart.top,buttonsTop:buttons.top};
  });
  expect(geometry.winnerTop).toBeGreaterThan(24);
  expect(geometry.championTop-geometry.cardsTop).toBeLessThan(10);
  expect(geometry.restartWidth).toBeCloseTo(geometry.buttonsWidth);
  expect(geometry.restartTop).toBeGreaterThan(geometry.buttonsTop);
  const pinned=await actions.boundingBox();
  await render(8);
  await expect(page.locator('.podiumOther')).toHaveCount(5);
  const scroll=await cards.evaluate(el=>{el.scrollTop=el.scrollHeight;return el.scrollTop});
  expect(scroll).toBeGreaterThan(0);
  expect(await actions.boundingBox()).toEqual(pinned);
  await expect(page.locator('.podiumOther').last()).toBeInViewport();
  await expect(page.locator('body')).toHaveCSS('touch-action','pan-y');
  const pinchPrevented=await page.evaluate(()=>!document.dispatchEvent(new Event('gesturestart',{cancelable:true})));
  expect(pinchPrevented).toBe(true);
});


test('clear all nicknames requires confirmation and clears both modes', async ({ page }) => {
  await page.goto(site);
  const inputs=page.locator('#nameInputs input');
  const modes=page.locator('#mode label');
  const panelStyle=locator=>locator.evaluate(el=>{
    const css=getComputedStyle(el);
    return [css.padding,css.borderWidth,css.borderColor,css.borderRadius];
  });
  expect(await panelStyle(id(page,'nameConfig'))).toEqual(await panelStyle(id(page,'peopleSettings')));
  await inputs.first().fill('小安');
  await inputs.last().fill('小白');
  await tap(page,'clearNicknames');
  await expect(id(page,'resetConfirmTitle')).toHaveText('确定清空全部昵称？');
  await expect(id(page,'resetConfirmDialog')).toHaveCSS('background-color','rgb(165, 43, 54)');
  await expect(inputs.first()).toHaveValue('小安');
  await tap(page,'resetCancel');
  await expect(inputs.last()).toHaveValue('小白');
  await modes.last().tap();
  await inputs.first().fill('小陈');
  await modes.first().tap();
  await tap(page,'clearNicknames');
  await tap(page,'resetConfirm');
  expect(await inputs.evaluateAll(nodes=>nodes.map(input=>input.value))).toEqual(['','','','']);
  await page.setViewportSize(landscape);
  await expect(id(page,'landscapeLaunchButton')).toContainText('A组 · 玩家1');
  await page.setViewportSize(portrait);
  await modes.last().tap();
  await expect(inputs.first()).toHaveValue('');
});


test('portrait end can cancel or save completed rounds between turns', async ({ page }) => {
  await page.clock.install();
  await page.goto(site);
  await testDuration(page);
  await launch(page);
  await tick(page,3080);
  await tap(page,'correct');
  await tick(page,3100);
  await expect(id(page,'between')).toBeVisible();
  await page.setViewportSize(portrait);
  const end=id(page,'portraitEnd');
  await expect(id(page,'portraitProgressCount')).toHaveText('已完成 1 / 4 人');
  await expect(end).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(end).toHaveCSS('background-color','rgb(185, 46, 67)');
  await end.tap();
  await tap(page,'endCancel');
  await expect(end).toBeVisible();
  await end.tap();
  await tap(page,'endConfirm');
  await expect(id(page,'setup')).toBeVisible();
  const progress=await fetchExport(page,'exportData');
  expect(progress.roundAudit).toHaveLength(1);
  expect(progress.roundAudit[0].event).toBe('game_ended');
  expect(progress.roundAudit[0].completedRounds[0].score).toBe(1);
});

test('setup details stay hidden until scrolling back and returning to the bottom', async ({ page }) => {
  await page.goto(site);
  const setup=id(page,'setup');
  const details=id(page,'setupDetails');
  const scrollFromBottom=distance=>setup.evaluate((el,offset)=>{
    el.scrollTop=el.scrollHeight-el.clientHeight-offset;
    el.dispatchEvent(new Event('scroll'));
  },distance);
  await expect(details).toBeHidden();
  await expect(id(page,'start')).toBeDisabled();
  await scrollFromBottom(0);
  await expect(id(page,'start')).toBeInViewport();
  await expect(details).toBeHidden();
  await scrollFromBottom(0);
  await expect(details).toBeHidden();
  await scrollFromBottom(64);
  await expect(details).toBeHidden();
  await scrollFromBottom(0);
  await expect(details).toBeVisible();
  await expect(id(page,'swipePreference')).toBeInViewport();
  await setup.evaluate(el=>{
    el.scrollTop=0;
    el.dispatchEvent(new Event('scroll'));
  });
  await expect(details).toBeHidden();
  await expect(id(page,'revealSetupDetails')).toHaveAttribute('aria-expanded','false');
  await scrollFromBottom(0);
  await expect(details).toBeHidden();
  await scrollFromBottom(64);
  await scrollFromBottom(0);
  await expect(details).toBeVisible();
  await page.reload();
  await expect(details).toBeHidden();
  await id(page,'revealSetupDetails').press('Enter');
  await expect(id(page,'swipePreference').locator(':checked')).toBeFocused();
  const [count,history,exportButton,importButton]=await details.locator('#count,#historyInfo,#exportData,#importData')
    .evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
  expect(history.top-count.bottom).toBeLessThan(6);
  expect(exportButton.width).toBeCloseTo(importButton.width);
  expect(exportButton.top).toBeCloseTo(importButton.top);

});

test('only a horizontal swipe on the title reveals its fireworks', async ({ page }) => {
  await page.clock.install();
  await page.goto(site);
  const stage=page.locator('.titleStage');
  const swipe=(origin,dx,dy)=>id(page,origin).evaluate((element,{dx,dy})=>{
    const dispatch=(type,x,y)=>element.dispatchEvent(new PointerEvent(type,{
      bubbles:true,pointerId:31,isPrimary:true,button:0,clientX:x,clientY:y,
    }));
    dispatch('pointerdown',160,120);
    dispatch('pointerup',160+dx,120+dy);
  },{dx,dy});
  await swipe('setupTitle',10,80);
  await swipe('setup',80,10);
  await expect(stage).not.toHaveAttribute('data-celebrating',/./);
  for(const [dx,direction] of [[-90,'left'],[90,'right']]){
    await swipe('setupTitle',dx,5);
    await expect(stage).toHaveAttribute('data-celebrating',direction);
    await expect(id(page,'titleFireworks').locator('.celebrationBurst')).toHaveCount(11);
    await tick(page,3280);
    await expect(id(page,'titleFireworks').locator('.celebrationBurst')).toHaveCount(11);
    await tick(page,300);
    await expect(stage).not.toHaveAttribute('data-celebrating',/./);
  }
});

test('reopening restores the last setup and resumes at the first incomplete turn', async ({ page }) => {
  await page.clock.install();
  await page.goto(site);
  await page.locator("#nameInputs input[data-key='A组-0']").fill('小安');
  await page.locator("#nameInputs input[data-key='B组-0']").fill('小白');
  await page.locator('#teamConfig label').last().locator('.stepMinus').tap();
  await testDuration(page);
  await tap(page,'penalty');
  await page.locator('#cats .cat').first().tap();
  await launch(page);
  await tick(page,3080);
  await tap(page,'correct');
  await tick(page,3100);
  await tap(page,'nextPlayer');
  await tick(page,3080);
  const interruptedWord=await id(page,'wordHans').textContent();
  await page.setViewportSize(portrait);
  await page.reload();
  await expect(id(page,'setupSavedSummary')).toContainText('已完成 1 / 3 人');
  await expect(page.locator("#nameInputs input[data-key='A组-0']")).toHaveValue('小安');
  await expect(page.locator('#teamConfig input').last()).toHaveValue('1');
  await expect(id(page,'duration')).toHaveValue('1');
  await expect(id(page,'penalty')).toBeChecked();
  await expect(page.locator('#cats .cat').first()).toHaveAttribute('aria-pressed','false');
  await tap(page,'setupRestore');
  await expect(id(page,'portraitProgressCount')).toHaveText('已完成 1 / 3 人');
  await expect(page.locator('.portraitProgressItem')).toContainText('1 分');
  await page.setViewportSize(landscape);
  await tap(page,'resumeAction');
  await tick(page,3080);
  await expect(id(page,'who')).toHaveText('小白猜');
  await expect(id(page,'score')).toHaveText('0 分');
  expect(await id(page,'wordHans').textContent()).not.toBe(interruptedWord);
  await page.setViewportSize(portrait);
  await tap(page,'portraitEnd');
  await tap(page,'endConfirm');
  const backup=await fetchExport(page,'exportData');
  expect(backup.roundAudit.at(-1).completedRounds[0].score).toBe(1);
  await page.reload();
  await expect(id(page,'setupSavedMatch')).toBeHidden();
  await expect(page.locator("#nameInputs input[data-key='B组-0']")).toHaveValue('小白');
});

test('low word supply can opt in to selected-category reuse and fit long words', async ({ page }) => {
  await page.clock.install();
  await page.goto(site);
  const category=await page.locator('#cats .cat').first().innerText();
  const fresh=await page.evaluate(name=>{
    const [head,...used]=BANK[name];
    for(const w of used)DATA.seen.add(wordKey(w));
    return head;
  },category);
  await tap(page,'all');
  await page.locator('#cats .cat').first().tap();
  await testDuration(page);
  await page.setViewportSize(landscape);
  await expect(id(page,'launchWordWarningText')).toContainText('新词剩余 1 个');
  await id(page,'reuseWords').check();
  await tap(page,'landscapeLaunchButton');
  await tick(page,3080);
  await expect(id(page,'wordHans')).toHaveText(fresh);
  await tap(page,'pass');
  await expect(id(page,'score')).toHaveText('0 分');
  await expect(id(page,'scoreChange')).toBeEmpty();
  const reused=await id(page,'wordHans').textContent();
  expect(reused).not.toEqual(fresh);
  expect(await page.evaluate(({name,word})=>BANK[name].includes(word),{name:category,word:reused})).toBe(true);
  await tap(page,'undoAction');
  expect(await page.evaluate(w=>DATA.seen.has(wordKey(w)),reused)).toBe(true);

  const fitted=async text=>page.evaluate(async content=>{
    word={w:content,k:'测试'};
    refreshWord();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const node=document.getElementById('wordHans');
    const box=document.getElementById('word');
    return {size:parseFloat(getComputedStyle(node).fontSize),height:box.scrollHeight,
      width:box.clientWidth,scrollWidth:box.scrollWidth,viewport:innerHeight,
      leftGap:box.getBoundingClientRect().left-document.querySelector('#pass .taplabel').getBoundingClientRect().right,
      rightGap:document.querySelector('#correct .taplabel').getBoundingClientRect().left-box.getBoundingClientRect().right};
  },text);
  const short=await fitted('飞龙');
  const nine=await fitted('这是一条九个字的词');
  expect(nine.size).toBeLessThan(short.size);
  expect(nine.scrollWidth).toBeLessThanOrEqual(nine.width);
  expect(Math.min(nine.leftGap,nine.rightGap)).toBeGreaterThanOrEqual(11);
  const long=await fitted('特别长的词语'.repeat(12));
  expect(short.size).toBeGreaterThan(70);
  expect(long.size).toBeLessThan(short.size);
  expect(long.height).toBeLessThan(long.viewport*.53);
  expect(long.scrollWidth).toBeLessThanOrEqual(long.width);
});

test('swipe moves both word lines toward a fixed portal and scores once', async ({ page }) => {
  await page.clock.install();
  await page.goto(site);
  await chooseSwipeStyle(page,'移动单词');
  await tap(page,'penalty');
  await launch(page);
  await tick(page,3080);
  const hud=page.locator('#game .hud');
  await expect(id(page,'undoAction')).toHaveCSS('background-color','rgb(113, 29, 40)');
  const initialHud=await hud.boundingBox();
  const layout=()=>hud.evaluate(frame=>{
    const items=[frame.querySelector('#who'),frame.querySelector('#timer'),frame.querySelector('#score')];
    const [name,time,score]=items.map(el=>el.getBoundingClientRect());
    const outer=frame.getBoundingClientRect();
    return {fonts:items.map(el=>getComputedStyle(el).fontSize),
      centers:[name,time,score].map(rect=>rect.top+rect.height/2),
      gaps:[name.left-outer.left,time.left-name.right,score.left-time.right,outer.right-score.right]};
  });
  const initialLayout=await layout();
  const [nameSize,timeSize,scoreSize]=initialLayout.fonts.map(parseFloat);
  expect(nameSize).toBe(scoreSize);
  expect(timeSize/(nameSize+2.5)).toBeCloseTo(1.06,2);
  expect(Math.max(...initialLayout.centers)-Math.min(...initialLayout.centers)).toBeLessThan(1);
  expect(Math.max(...initialLayout.gaps)-Math.min(...initialLayout.gaps)).toBeLessThan(1);
  expect(Math.min(...initialLayout.gaps)).toBeGreaterThan(23);
  await expect(id(page,'passHint')).toHaveText('− 1 分');
  await expect(page.locator('#pass .taplabel')).not.toContainText('←');
  await expect(page.locator('#pass .swipeHint')).toHaveAccessibleName('左滑跳过');
  await expect(page.locator('#correct .swipeHint')).toHaveAccessibleName('右滑猜中');
  const hint=page.locator('#pass .swipeHint');
  expect((await hint.boundingBox()).height).toBeGreaterThan(60);
  await expect(hint).toHaveCSS('stroke-linecap','round');
  for(const side of ['pass','correct']){
    const label=page.locator(`#${side} .taplabel`);
    const textColor=await label.locator('span').evaluate(el=>getComputedStyle(el).color);
    await expect(label.locator('.swipeHint path')).toHaveCSS('stroke',textColor);
    await expect(label.locator('.swipeHint path')).toHaveCSS('animation-name','swipeHintNudge');
    await expect(label.locator('small')).toHaveCSS('font-size',await label.evaluate(el=>getComputedStyle(el).fontSize));
    await expect(label).toHaveCSS('opacity','0.43');
  }
  await expect(page.locator('#correct .taplabel')).not.toContainText('✓');
  await expect(page.locator('#correct .taplabel')).toContainText('+ 1 分');
  const leftPortal=await page.locator('.wordPortalLeft').boundingBox();
  const rightPortal=await page.locator('.wordPortalRight').boundingBox();
  expect(leftPortal.width).toBe(rightPortal.width);
  expect(leftPortal.height).toBe(rightPortal.height);
  expect(leftPortal.height).toBe(126);
  expect(leftPortal.width).toBe(38);
  expect(leftPortal.x).toBe(13);
  expect(rightPortal.x+rightPortal.width).toBe(landscape.width-13);
  const leftArrow=await hint.boundingBox();
  expect(Math.abs(leftArrow.y+leftArrow.height/2-leftPortal.y-leftPortal.height/2)).toBeLessThan(.5);
  const drag=async (from,to,target='game')=>page.evaluate(({from,to,target})=>{
    const origin=document.getElementById(target);
    const game=document.getElementById('game');
    const emit=(element,type,clientX)=>element.dispatchEvent(new PointerEvent(type,{
      bubbles:true,isPrimary:true,pointerId:21,pointerType:'touch',button:0,clientX,clientY:215,
    }));
    const labels=[...game.querySelectorAll('.taplabel,.swipeHint')];
    const positions=()=>labels.map(label=>label.getBoundingClientRect().x);
    const before=positions();
    const portal=game.querySelector(to<from?'.wordPortalLeft':'.wordPortalRight');
    const shell=portal.querySelector('.portalShell');
    const shadow=portal.querySelector('.portalShadow');
    const openingEdge=()=>to<from?shell.getBoundingClientRect().right:shell.getBoundingClientRect().left;
    const restingEdge=openingEdge();
    const restingShadow=shadow.getBoundingClientRect().toJSON();
    const layers=[shadow,document.getElementById('word'),shell].map(element=>Number(getComputedStyle(element).zIndex));
    const shadowClip=getComputedStyle(shadow).clipPath;
    const portalLayer=getComputedStyle(portal).zIndex;
    const otherShell=game.querySelector(to<from?'.wordPortalRight .portalShell':'.wordPortalLeft .portalShell');
    emit(origin,'pointerdown',from);
    emit(game,'pointermove',(from+to)/2);
    const halfPortalScale=parseFloat(shell.style.scale);
    const halfShadowOpacity=Number(getComputedStyle(shadow).opacity);
    const centerX=element=>{const box=element.getBoundingClientRect();return box.left+box.width/2};
    const halfOffset=Math.abs(centerX(document.getElementById('word'))-centerX(game));
    const halfScale=parseFloat(document.getElementById('word').style.scale);
    emit(game,'pointermove',to);
    const portalScale=parseFloat(shell.style.scale);
    const movingEdge=openingEdge();
    const movingShadow=shadow.getBoundingClientRect().toJSON();
    const movingShell=shell.getBoundingClientRect().toJSON();
    const shadowOpacity=Number(getComputedStyle(shadow).opacity);
    const oppositeScale=getComputedStyle(otherShell).scale;
    const word=document.getElementById('word');
    const rect=word.getBoundingClientRect();
    const gameRect=game.getBoundingClientRect();
    const offset=Math.round(rect.left+rect.width/2-gameRect.left-gameRect.width/2);
    const squeeze=parseFloat(word.style.scale);
    const after=positions();
    const widths=['pass','correct'].map(id=>document.getElementById(id).getBoundingClientRect().width);
    emit(game,'pointerup',to);
    // A browser can emit a click after releasing a captured pointer.
    document.getElementById(to<426?'pass':'correct').dispatchEvent(new MouseEvent('click',{
      bubbles:true,cancelable:true,detail:1,clientX:to,
    }));
    const animation=game.getAnimations({subtree:true}).find(a=>a.id==='word-absorption');
    if(!animation)return {offset,squeeze,before,after,widths};
    const copy=animation.effect.target;
    const arrival=game.getAnimations({subtree:true}).find(a=>a.id==='word-from-hud');
    const arrivalFrames=arrival.effect.getKeyframes();
    const arrivalStartsAbove=arrivalFrames[0].translate!==arrivalFrames.at(-1).translate
      && Number(arrivalFrames[0].scale)<Number(arrivalFrames.at(-1).scale);
    const pulse=shell.getAnimations().find(animation=>animation.id==='portal-pulse');
    const pulseFrames=pulse.effect.getKeyframes();
    const shadowFrames=shadow.getAnimations().find(animation=>animation.id==='portal-shadow').effect.getKeyframes();
    const portalBounds=portal.getBoundingClientRect().toJSON();
    animation.pause();
    const duration=animation.effect.getTiming().duration;
    const wordBounds=()=>{
      const lines=[...copy.children].map(line=>line.getBoundingClientRect());
      const top=Math.min(...lines.map(line=>line.top));
      const bottom=Math.max(...lines.map(line=>line.bottom));
      return {top,bottom,height:bottom-top,left:Math.min(...lines.map(line=>line.left)),
        right:Math.max(...lines.map(line=>line.right))};
    };
    const approachTime=duration*(animation.effect.getKeyframes().length===3?animation.effect.getKeyframes()[1].computedOffset:0);
    animation.currentTime=approachTime;
    const approach=wordBounds();
    animation.currentTime=duration;
    const destination=wordBounds();
    animation.currentTime=0;
    animation.play();
    return {offset,squeeze,before,after,widths,halfScale,duration,arrivalStartsAbove,approach,destination,target:portalBounds,clip:copy.parentElement.style.clipPath,lines:copy.children.length,
      restingEdge,movingEdge,restingShadow,movingShadow,movingShell,shadowScales:shadowFrames.map(frame=>Number(frame.scale.split(' ').at(-1))),halfShadowOpacity,shadowOpacity,layers,shadowClip,portalLayer,
      portalScale,halfPortalScale,halfOffset,oppositeScale,pulseScales:pulseFrames.map(frame=>parseFloat(frame.scale)),
      retractDuration:pulse.effect.getTiming().duration-duration,swallowDuration:duration-approachTime,arrivalDelay:arrival.effect.getTiming().delay};
  },{from,to,target});
  const edgePositions=await page.evaluate(()=>{
    const game=document.getElementById('game'),word=document.getElementById('word');
    const emit=(type,x)=>game.dispatchEvent(new PointerEvent(type,{
      bubbles:true,isPrimary:true,pointerId:42,pointerType:'touch',button:0,clientX:x,clientY:215,
    }));
    emit('pointerdown',25);
    const centers=[465,575,465].map(x=>{
      emit('pointermove',x);
      const rect=word.getBoundingClientRect();
      return rect.left+rect.width/2;
    });
    emit('pointercancel',465);
    return centers;
  });
  expect(edgePositions[1]).toBeGreaterThan(edgePositions[0]);
  expect(edgePositions[2]).toBeCloseTo(edgePositions[0]);
  const left=await drag(495,295);
  expect(left.offset).toBe(-200);
  expect(left.squeeze).toBeLessThan(1);
  expect(left.widths).toEqual([426,426]);
  expect(left.after).toEqual(left.before);
  expect(left.lines).toBe(2);
  expect(left.arrivalStartsAbove).toBe(true);
  expect(left.duration).toBeGreaterThanOrEqual(117);
  expect(left.duration).toBeLessThanOrEqual(197);
  expect(left.halfScale).toBeCloseTo((1+left.squeeze)/2);
  const expectInsidePortal=({approach,destination,target})=>{
    const middle=rect=>rect.top+rect.height/2;
    expect(Math.abs(middle(approach)-middle(target))).toBeLessThan(.5);
    expect(approach.height).toBeGreaterThan(target.height*.62);
    expect(approach.height).toBeLessThan(target.height*.72);
    expect(destination.height).toBeCloseTo(approach.height);
  };
  expectInsidePortal(left);
  expect(left.clip).toBe('inset(0px 0px 0px 51px)');
  expect(left.approach.left).toBeGreaterThan(left.target.right);
  expect(left.destination.right).toBeLessThan(left.target.right);
  await expect(id(page,'score')).toHaveText('-1 分');
  await expect(id(page,'undoAction')).toHaveCSS('background-color',await id(page,'pass').evaluate(el=>getComputedStyle(el).backgroundColor));
  await tick(page,600);
  const right=await drag(300,540);
  expect(right.offset).toBeGreaterThan(0);
  expect(right.widths).toEqual([426,426]);
  expectInsidePortal(right);
  for(const swipe of [left,right]){
    const [shadowLayer,wordLayer,shellLayer]=swipe.layers;
    expect(swipe.portalLayer).toBe('auto');
    expect(shadowLayer).toBeLessThan(wordLayer);
    expect(shellLayer).toBeGreaterThan(4);
    expect(swipe.shadowClip).toMatch(/^inset\(-10px (?:-10px -10px 50%|50% -10px -10px)\)$/);
    expect(swipe.movingEdge).toBeCloseTo(swipe.restingEdge,5);
    expect(swipe.movingShadow.width).toBeCloseTo(swipe.restingShadow.width);
    expect(swipe.movingShadow.height).toBeGreaterThan(swipe.restingShadow.height);
    const topMargin=swipe.movingShadow.top-swipe.movingShell.top;
    const bottomMargin=swipe.movingShell.bottom-swipe.movingShadow.bottom;
    expect(topMargin).toBeGreaterThan(12);
    expect(topMargin).toBeCloseTo(bottomMargin);
    expect(swipe.shadowScales.slice(-2)).toEqual([1.28,1]);
    expect(swipe.halfShadowOpacity).toBeGreaterThan(0);
    expect(swipe.shadowOpacity).toBeGreaterThan(swipe.halfShadowOpacity);
    expect(swipe.halfPortalScale).toBeGreaterThan(1);
    expect(swipe.portalScale).toBeCloseTo(Math.min(1.12,1+Math.abs(swipe.offset)/swipe.halfOffset*(swipe.halfPortalScale-1)),3);
    expect(swipe.oppositeScale).toBe('none');
    expect(swipe.pulseScales[0]).toBeCloseTo(swipe.portalScale,4);
    expect(swipe.pulseScales.slice(-2)).toEqual([1.12,1]);
    expect(swipe.retractDuration).toBe(55);
    expect(swipe.swallowDuration).toBeGreaterThan(32);
    expect(swipe.arrivalDelay).toBe(swipe.duration);
  }
  expect(right.clip).toBe('inset(0px 51px 0px 0px)');
  expect(right.approach.right).toBeLessThan(right.target.left);
  expect(right.destination.left).toBeGreaterThan(right.target.left);
  expect(right.after).toEqual(right.before);
  await expect(id(page,'score')).toHaveText('0 分');
  await tick(page,600);
  await tap(page,'undoAction');
  await expect(id(page,'score')).toHaveText('-1 分');
  await expect(page.locator('.wordInTransit')).toHaveCount(2);
  const ejection=await id(page,'game').evaluate(game=>{
    const animation=game.getAnimations({subtree:true}).find(a=>a.id==='word-ejection');
    const frames=animation.effect.getKeyframes();
    const rewind=game.getAnimations({subtree:true}).find(a=>a.id==='word-into-hud');
    const rewindFrames=rewind.effect.getKeyframes();
    return {duration:animation.effect.getTiming().duration,clip:animation.effect.target.parentElement.style.clipPath,
      scales:frames.map(frame=>Number(frame.scale)),positions:frames.map(frame=>frame.translate),
      rewindScales:rewindFrames.map(frame=>Number(frame.scale))};
  });
  expect(ejection.duration).toBe(185);
  expect(ejection.rewindScales).toEqual([1,.3]);
  expect(ejection.clip).toBe('inset(0px 51px 0px 0px)');
  expect(ejection.scales[0]).toBeGreaterThan(.2);
  expect(ejection.scales[0]).toBe(ejection.scales[1]);
  expect(ejection.scales[2]).toBe(1);
  expect(new Set(ejection.positions).size).toBe(3);
  await tick(page,210);
  await expect(page.locator('.wordInTransit')).toHaveCount(0);
  const currentHud=await hud.boundingBox();
  expect(currentHud.width).toBe(initialHud.width);
  expect(currentHud.x).toBe(initialHud.x);
  await tick(page,600);
  await drag(420,440);
  await expect(id(page,'score')).toHaveText('-1 分');
  // Dragging from the controls does not start a swipe.
  const ignored=await page.evaluate(()=>{
    const emit=(id,type,clientX)=>document.getElementById(id).dispatchEvent(new PointerEvent(type,{
      bubbles:true,isPrimary:true,pointerId:22,button:0,clientX,clientY:30,
    }));
    emit('pauseAction','pointerdown',800);
    emit('game','pointermove',560);
    return document.getElementById('word').style.translate;
  });
  expect(ignored).toBe('');
});

test('hidden interaction preference persists and the divider keeps its scoring direction', async ({page})=>{
  await page.clock.install();
  await page.goto(site);
  await id(page,'revealSetupDetails').focus();
  await page.keyboard.press('Enter');
  await expect(id(page,'setupDetails').locator(':scope > :first-child')).toHaveAttribute('id','swipePreference');
  await expect(id(page,'game')).toHaveAttribute('data-swipe-style','divider');
  await chooseSwipeStyle(page,'移动单词');
  await page.reload();
  await expect(id(page,'game')).toHaveAttribute('data-swipe-style','word');
  await chooseSwipeStyle(page,'移动中线');
  const chosen=page.getByRole('radiogroup',{name:'交互方式'}).locator('input:checked + span');
  await expect(chosen).toHaveCSS('border-top-color','rgb(106, 171, 255)');
  const swipeHeading=await id(page,'swipeHeading').boundingBox();
  const modeHeading=await id(page,'modeHeading').boundingBox();
  expect(swipeHeading.x).toBeCloseTo(modeHeading.x);

  await page.reload();
  await launch(page);
  await tick(page,2250);
  await expect(id(page,'countdownNumber')).toHaveText('1');
  await expect(id(page,'swipeTutorial')).toHaveCount(0);
  await tick(page,830);
  await expect(page.locator('.wordPortalLeft')).toBeHidden();
  await expect(page.locator('#pass .swipeHint')).toHaveAccessibleName('右滑跳过');
  for(const side of ['pass','correct']){
    await expect(page.locator(`#${side} .taplabel`)).toHaveCSS('opacity','0.54');
    await expect(page.locator(`#${side} .swipeHint path`)).toHaveCSS('animation-name','swipeHintNudge');
  }
  const split=await page.evaluate(()=>{
    const game=document.getElementById('game');
    const emit=(type,clientX)=>game.dispatchEvent(new PointerEvent(type,{
      bubbles:true,isPrimary:true,pointerId:33,pointerType:'touch',button:0,clientX,clientY:215,
    }));
    emit('pointerdown',600);
    emit('pointermove',350);
    const width=parseFloat(game.style.getPropertyValue('--game-split'));
    emit('pointerup',350);
    return width;
  });
  expect(split).toBeLessThan(50);
  await expect(id(page,'score')).toHaveText('1 分');
  for(const [side,score] of [['correct','2 分'],['pass','2 分']]){
    await tick(page,400);
    await tap(page,side);
    const frames=await id(page,side).evaluate(el=>el.getAnimations()[0]?.effect.getKeyframes());
    expect(frames?.some(frame=>frame.width==='100%')).toBe(true);
    await expect(id(page,'score')).toHaveText(score);
  }
});

test('solo colors persist outside the white gameplay HUD', async ({page})=>{
  await page.clock.install();
  await page.goto(site);
  await page.locator('#mode label').last().tap();
  const labels=page.locator('#nameInputs .namePlayerLabel');
  const palette=await labels.evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).color));
  expect(new Set(palette).size).toBe(4);
  for(const [index,tint] of palette.entries()){
    await expect(page.locator('#nameInputs input').nth(index)).toHaveCSS('border-color',tint);
  }
  await page.locator('#nameInputs input').first().fill('小安');
  await testDuration(page);
  await page.setViewportSize(landscape);
  await expect(page.locator('#landscapeLaunchButton .rolePerson')).toHaveCSS('color',palette[0]);
  await tap(page,'landscapeLaunchButton');
  for(const [index,tint] of palette.entries()){
    await expect(page.locator('#countdownTitle .rolePerson')).toHaveCSS('color',tint);
    await tick(page,3080);
    await expect(page.locator('#who span').first()).toHaveCSS('color','rgb(255, 255, 255)');
    await tick(page,3100);
    await expect(id(page,'roundTitle')).toHaveCSS('color',tint);
    await tap(page,'nextPlayer');
  }
  await expect(page.locator('.first .podiumName')).toHaveCSS('background-color',palette[0]);
  await expect(page.locator('.second .podiumName')).toHaveCSS('background-color',palette[1]);
  await expect(page.locator('.third .podiumName')).toHaveCSS('background-color',palette[2]);
  await expect(page.locator('.podiumOther .podiumName')).toHaveCSS('background-color',palette[3]);
});

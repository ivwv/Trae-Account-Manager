
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const THEMES = ['light', 'dark', 'purple', 'green'];
const PAGES = [
  { id: 'dashboard', label: '仪表盘' },
  { id: 'accounts', label: '账号管理' },
  { id: 'settings', label: '设置' },
  { id: 'about', label: '关于' }
];

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Ensure screenshots directory exists
  if (!fs.existsSync('screenshots')) {
    fs.mkdirSync('screenshots');
  }

  console.log('Starting verification...');

  try {
    for (const theme of THEMES) {
      console.log(`\nTesting Theme: ${theme.toUpperCase()}`);
      
      // Set theme via localStorage and reload to ensure clean state
      await page.goto('http://localhost:1420');
      await page.evaluate((t) => {
        localStorage.setItem('trae_theme_v1', t);
      }, theme);
      await page.reload();
      
      // Verify theme is applied
      const currentTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      console.log(`  Current data-theme: ${currentTheme}`);

      for (const pageInfo of PAGES) {
        console.log(`  Checking Page: ${pageInfo.label}`);
        
        // Navigate
        await page.click(`.sidebar-item:has-text("${pageInfo.label}")`);
        await page.waitForTimeout(500); // Wait for render

        // Screenshot
        await page.screenshot({ path: `screenshots/${pageInfo.id}-${theme}.png` });

        // Check contrast/visibility of key elements
        const styles = await page.evaluate(() => {
          const getStyle = (selector) => {
            const el = document.querySelector(selector);
            if (!el) return null;
            const style = window.getComputedStyle(el);
            return {
              bg: style.backgroundColor,
              color: style.color
            };
          };

          return {
            body: getStyle('body'),
            content: getStyle('.app-content'),
            card: getStyle('.card') || getStyle('.stat-card') || getStyle('.settings-card'),
            input: getStyle('input'),
            sidebar: getStyle('.sidebar')
          };
        });

        console.log(`    Styles for ${pageInfo.id} [${theme}]:`);
        console.log(`      Body BG: ${styles.body?.bg}`);
        console.log(`      Body Text: ${styles.body?.color}`);
        
        // Detailed checks
        const details = await page.evaluate(() => {
            const getComputed = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                const s = window.getComputedStyle(el);
                return { bg: s.backgroundColor, color: s.color, border: s.borderColor };
            };
            return {
                sidebar: getComputed('.sidebar'),
                sidebarItem: getComputed('.sidebar-item'),
                sidebarItemActive: getComputed('.sidebar-item.active'),
                button: getComputed('button'),
                input: getComputed('input'),
                card: getComputed('.account-card') || getComputed('.stat-card'),
                header: getComputed('.page-header') || getComputed('.app-header')
            };
        });

        if (details.sidebar) console.log(`      Sidebar: BG=${details.sidebar.bg}, Text=${details.sidebar.color}`);
        if (details.sidebarItem) console.log(`      Sidebar Item: BG=${details.sidebarItem.bg}, Text=${details.sidebarItem.color}`);
        if (details.button) console.log(`      Button: BG=${details.button.bg}, Text=${details.button.color}`);
        if (details.input) console.log(`      Input: BG=${details.input.bg}, Text=${details.input.color}`);
        if (details.card) console.log(`      Card: BG=${details.card.bg}, Text=${details.card.color}`);

        
        // Simple heuristic for "invisible text" (e.g. white on white)
        // This is not perfect as colors can be rgb/rgba/hex
        // But logging it helps me (the agent) see if they are identical
      }
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

run();

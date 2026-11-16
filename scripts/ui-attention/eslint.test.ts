import { describe } from 'bun:test';
import { RuleTester } from 'eslint';
import { runBunRuleTests } from './bun-rule-tester';
import { attentionRule } from './eslint';

describe('attention checks distinguish competing actions from separate conditional views', () => {
  runBunRuleTests(new RuleTester({ languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } }), 'attention', attentionRule, {
    valid: [
      '<main><Button variant="primary">Save</Button><Button variant="secondary">Cancel</Button></main>',
      '<main>{editing ? <Button variant="primary">Save</Button> : <Button variant="primary">Create</Button>}</main>',
      '<header><a href="/"><span class="brand">Books</span></a></header>',
      '<header><HomeButton><span class="brand">Books</span></HomeButton></header>',
      '<p class="subtitle" data-ui-copy="essential">Your changes could not be saved. Try again.</p>',
      '<details><summary>Help</summary><p class="subtitle">Use arrow keys to browse.</p></details>',
      '<header data-ui-navbar><HomeButton>Books</HomeButton><MenuItem data-ui-action="settings">Settings</MenuItem></header>',
      '<header><p>Essential landing-page introduction.</p></header>',
      '<SettingsWorkspace><Input style={{ fontWeight: 400 }}/></SettingsWorkspace>',
      '<Dialog title="Export book"><Button>Download</Button></Dialog>',
    ],
    invalid: [
      { code: '<main><div><Button variant="primary">Create</Button></div><Button variant="primary">Import</Button></main>', errors: [{ messageId: 'primary' }] },
      { code: '<header><div class="brand">Books</div></header>', errors: [{ messageId: 'home' }] },
      { code: '<p class="subtitle">Manage your settings here.</p>', errors: [{ messageId: 'subtitle' }] },
      { code: '<header data-ui-navbar><small>Saved on this device</small></header>', errors: [{ messageId: 'navCopy' }] },
      { code: '<header data-ui-navbar><span role="status">Saved</span></header>', errors: [{ messageId: 'navCopy' }] },
      { code: '<nav data-ui-navbar><Button data-ui-action="settings">Preferences</Button><ActionMenu><MenuItem data-ui-action="settings">Settings</MenuItem></ActionMenu></nav>', errors: [{ messageId: 'duplicate', data:{action:'settings'} }] },
      { code: '<Dialog title="Preferences"><Input/></Dialog>', errors: [{messageId:'settings'}] },
      { code: '<Dialog title={title}><PreferencesSurface/></Dialog>', errors: [{messageId:'settings'}] },
      { code: '<Input style={{fontWeight:600}}/>', errors: [{messageId:'inputWeight'}] },
    ],
  });
});

const STORAGE_KEY = 'endpoint_rejector_rules';

async function getRules() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function saveRules(rules) {
  await chrome.storage.local.set({ [STORAGE_KEY]: rules });
  renderRules(rules);
  syncToPage(rules);
}

async function syncToPage(rules) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      func: (rules) => {
        localStorage.setItem('__endpoint_rejector_rules__', JSON.stringify(rules));
      },
      args: [rules],
    });
  } catch (e) {
    console.warn('Could not sync rules to page:', e);
  }
}

function renderRules(rules) {
  const list = document.getElementById('rulesList');
  const count = document.getElementById('count');
  const active = rules.filter((r) => r.enabled).length;
  count.textContent = `${active}/${rules.length} active`;

  if (rules.length === 0) {
    list.innerHTML = '<div class="empty"><p>No rules</p><p>Add a URL pattern to start rejecting endpoints</p></div>';
    return;
  }

  list.innerHTML = rules
    .map(
      (rule, i) => `
    <div class="rule">
      <label class="toggle rule-toggle">
        <input type="checkbox" ${rule.enabled ? 'checked' : ''} data-index="${i}" class="toggle-input" />
        <span class="slider"></span>
      </label>
      <div class="rule-info">
        <div class="rule-pattern">${escapeHtml(rule.pattern)}</div>
      </div>
      <span class="rule-status ${rule.statusCode >= 500 ? 'status-5xx' : 'status-4xx'}">${rule.statusCode}</span>
      <button class="btn-edit" data-index="${i}" title="Edit rule">&#9998;</button>
      <button class="btn-delete" data-index="${i}" title="Remove rule">&times;</button>
    </div>
  `
    )
    .join('');

  list.querySelectorAll('.toggle-input').forEach((el) => {
    el.addEventListener('change', async (e) => {
      const rules = await getRules();
      rules[e.target.dataset.index].enabled = e.target.checked;
      await saveRules(rules);
    });
  });

  list.querySelectorAll('.btn-edit').forEach((el) => {
    el.addEventListener('click', (e) => {
      const index = e.target.dataset.index;
      const rule = rules[index];
      const ruleEl = e.target.closest('.rule');
      const statusOptions = [400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504];
      ruleEl.className = 'rule-editing';
      ruleEl.innerHTML = `
        <input type="text" class="edit-pattern" value="${escapeHtml(rule.pattern)}" />
        <select class="edit-status">
          ${statusOptions.map((s) => `<option value="${s}" ${s === rule.statusCode ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button class="btn-save" data-index="${index}">Save</button>
        <button class="btn-cancel">Cancel</button>
      `;
      ruleEl.querySelector('.btn-save').addEventListener('click', async () => {
        const newPattern = ruleEl.querySelector('.edit-pattern').value.trim();
        if (!newPattern) return;
        const allRules = await getRules();
        allRules[index].pattern = newPattern;
        allRules[index].statusCode = parseInt(ruleEl.querySelector('.edit-status').value, 10);
        await saveRules(allRules);
      });
      ruleEl.querySelector('.btn-cancel').addEventListener('click', () => renderRules(rules));
      ruleEl.querySelector('.edit-pattern').focus();
    });
  });

  list.querySelectorAll('.btn-delete').forEach((el) => {
    el.addEventListener('click', async (e) => {
      const rules = await getRules();
      rules.splice(e.target.dataset.index, 1);
      await saveRules(rules);
    });
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Add rule
document.getElementById('addBtn').addEventListener('click', async () => {
  const pattern = document.getElementById('pattern').value.trim();
  const statusCode = parseInt(document.getElementById('statusCode').value, 10);
  if (!pattern) return;

  const rules = await getRules();
  rules.push({ pattern, statusCode, enabled: true });
  await saveRules(rules);
  document.getElementById('pattern').value = '';
});

document.getElementById('pattern').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('addBtn').click();
});

// Clear all
document.getElementById('clearBtn').addEventListener('click', async () => {
  await saveRules([]);
});

// Copy rules as JSON
document.getElementById('exportBtn').addEventListener('click', async () => {
  const rules = await getRules();
  await navigator.clipboard.writeText(JSON.stringify(rules, null, 2));
  const btn = document.getElementById('exportBtn');
  btn.textContent = 'Copied!';
  setTimeout(() => (btn.textContent = 'Copy rules'), 1500);
});

// Init
getRules().then(renderRules);

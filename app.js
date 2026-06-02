// ============================================================
// AIB Budget Calculator - Main Application
// ============================================================

(function () {
    'use strict';

    // ---- Default Category Rules ----
    const DEFAULT_RULES = {
        'Salary/Income': ['SALARY', 'WAGES', 'CREDIT TRANSFER', 'N IRELAND SUP', 'PDY003'],
        'Savings Transfer': ['ONLINE SAVER', 'SAVINGS', 'SAVING', 'SAVE INTEREST', 'PERSONAL FIX', 'PERSONAL DEM', 'INET PSP'],
        'Mortgage/Rent': ['MORTGAGE', 'RENT', 'STAMP DUTY'],
        'Groceries': ['ALDI', 'LIDL', 'TESCO', 'DUNNES', 'SUPERVALU', 'CENTRA', 'SPAR', 'ICELAND'],
        'Entertainment': ['RESTAURANT', 'MCDONALDS', 'BURGER KING', 'DOMINOS', 'JUST EAT', 'DELIVEROO', 'APACHE', 'SUPERMACS', 'BAR', 'PUB', 'INN', 'BREWING', 'CINEMA', 'TICKETMASTER', 'EVENTBRITE', 'NETFLIX', 'SPOTIFY', 'DISNEY', 'AMAZON PRIME', 'YOUTUBE', 'CRUNCHYROLL', 'NOW TV', 'APPLE.COM'],
        'Transport': ['PETROL', 'FUEL', 'CIRCLE K', 'APPLEGREEN', 'TOPAZ', 'LEAP', 'DUBLIN BUS', 'LUAS', 'IRISH RAIL', 'PARKING', 'DAYBREAK', 'TOLL'],
        'Bills & Utilities': ['ELECTRIC', 'GAS', 'VODAFONE', 'THREE', 'EFIBRE', 'VIRGIN MEDIA', 'IRISH WATER', 'BORD GAIS', 'ESB', 'FLOGAS', 'SKY'],
        'Insurance': ['IRISH LIFE', 'AVIVA', 'ZURICH', 'LAYA', 'VHI', 'AIG', 'ALLIANZ', 'FBD'],
        'Shopping': ['AMAZON', 'PENNEYS', 'PRIMARK', 'TKMAXX', 'HARVEY NORMAN', 'CURRYS', 'ARGOS', 'BOOTS'],
        'Health': ['PHARMACY', 'PHYSIO', 'DOCTOR', 'DENTIST', 'OPTICIAN', 'SPECSAVERS', 'CHEMIST'],
        'Cash': ['ATM', 'VDA-'],
        'Car Payment': ['BMW FINANCIAL', 'MOTOR FINANCE', 'PCP', 'HP'],
        'Phone Top-Up': ['TOP-UP', 'TOPUP'],
        'Transfers': ['*MOBI', 'REVOLUT'],
        'Other': []
    };

    // ---- State ----
    let accounts = []; // { name: string, fileName: string, transactions: [] }
    let transactions = []; // combined/filtered view
    let activeAccount = 'all';
    let categoryRules = loadRules();
    let budgets = loadBudgets();
    let excludedTxIds = loadExcludedIds();

    function getTxId(tx) {
        return `${formatDate(tx.date)}_${tx.description}_${tx.debit}`;
    }

    function loadExcludedIds() {
        const stored = localStorage.getItem('aib-budget-excluded');
        if (stored) {
            try { return new Set(JSON.parse(stored)); } catch (e) { /* fall through */ }
        }
        return new Set();
    }

    function saveExcluded() {
        localStorage.setItem('aib-budget-excluded', JSON.stringify([...excludedTxIds]));
    }

    // ---- Initialization ----
    document.addEventListener('DOMContentLoaded', init);

    function init() {
        setupDropZone();
        setupTabs();
        setupModals();
    }

    // ---- CSV Parsing ----
    function parseCSV(text) {
        const lines = text.trim().split('\n');
        if (lines.length < 2) return [];

        // Skip header
        const results = [];
        for (let i = 1; i < lines.length; i++) {
            const row = parseCSVLine(lines[i]);
            if (row.length < 10) continue;

            const tx = {
                account: cleanField(row[0]),
                date: parseDate(cleanField(row[1])),
                description: [cleanField(row[2]), cleanField(row[3]), cleanField(row[4])].filter(Boolean).join(' '),
                debit: parseAmount(cleanField(row[5])),
                credit: parseAmount(cleanField(row[6])),
                balance: parseAmount(cleanField(row[7])),
                currency: cleanField(row[8]),
                type: cleanField(row[9])
            };

            if (tx.date) {
                tx.category = categorize(tx);
                tx.isTransfer = isInternalTransfer(tx);
                results.push(tx);
            }
        }

        // Sort by date ascending
        results.sort((a, b) => a.date - b.date);
        return results;
    }

    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    function cleanField(str) {
        return (str || '').trim().replace(/^"|"$/g, '');
    }

    function parseDate(str) {
        // DD/MM/YYYY format
        const parts = str.split('/');
        if (parts.length !== 3) return null;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
    }

    function parseAmount(str) {
        if (!str || str.trim() === '') return 0;
        // Remove commas and spaces, parse as float
        const cleaned = str.replace(/,/g, '').replace(/\s/g, '');
        const val = parseFloat(cleaned);
        return isNaN(val) ? 0 : val;
    }

    // ---- Categorization ----
    function categorize(tx) {
        const desc = tx.description.toUpperCase();

        // Build a flat list of all keyword-category pairs, sorted by keyword length descending
        // This ensures more specific keywords match before broader ones
        const pairs = [];
        for (const [category, keywords] of Object.entries(categoryRules)) {
            if (category === 'Other') continue;
            for (const keyword of keywords) {
                pairs.push({ keyword: keyword.toUpperCase(), category });
            }
        }
        pairs.sort((a, b) => b.keyword.length - a.keyword.length);

        for (const pair of pairs) {
            if (desc.includes(pair.keyword)) {
                return pair.category;
            }
        }
        return 'Other';
    }

    function isInternalTransfer(tx) {
        const transferCategories = ['Savings Transfer', 'Transfers'];
        return transferCategories.includes(tx.category);
    }

    // ---- Data Analysis ----
    function getMonthKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function getMonthLabel(key) {
        const [year, month] = key.split('-');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[parseInt(month) - 1]} ${year}`;
    }

    function getMonthlyData() {
        const monthly = {};

        for (const tx of transactions) {
            const key = getMonthKey(tx.date);
            if (!monthly[key]) {
                monthly[key] = {
                    income: 0,
                    spending: 0,
                    transfers: 0,
                    totalDebits: 0,
                    totalCredits: 0,
                    startBalance: null,
                    endBalance: 0,
                    transactions: []
                };
            }

            const m = monthly[key];
            m.transactions.push(tx);
            m.endBalance = tx.balance;
            if (m.startBalance === null) m.startBalance = tx.balance + tx.debit - tx.credit;

            // Track all money movement
            m.totalDebits += tx.debit;
            m.totalCredits += tx.credit;

            const txId = getTxId(tx);
            const isExcluded = excludedTxIds.has(txId);

            if (tx.isTransfer) {
                m.transfers += tx.debit || tx.credit;
            } else if (tx.credit > 0) {
                m.income += tx.credit;
            } else if (tx.debit > 0 && !isExcluded) {
                m.spending += tx.debit;
            }
        }

        return monthly;
    }

    function getCategoryData(yearFilter, monthFilter) {
        const categories = {};
        let filteredTx = transactions.filter(tx => tx.debit > 0 && !tx.isTransfer && !excludedTxIds.has(getTxId(tx)));

        if (yearFilter && yearFilter !== 'all') {
            filteredTx = filteredTx.filter(tx => tx.date.getFullYear().toString() === yearFilter);
        }
        if (monthFilter && monthFilter !== 'all') {
            const monthNum = parseInt(monthFilter, 10);
            filteredTx = filteredTx.filter(tx => (tx.date.getMonth() + 1) === monthNum);
        }

        for (const tx of filteredTx) {
            if (!categories[tx.category]) {
                categories[tx.category] = { total: 0, count: 0 };
            }
            categories[tx.category].total += tx.debit;
            categories[tx.category].count++;
        }

        return categories;
    }

    // ---- UI Setup ----
    function setupDropZone() {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files);
            files.forEach(f => handleFile(f));
        });

        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            files.forEach(f => handleFile(f));
        });
    }

    function setupTabs() {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => {
                    t.classList.remove('active');
                    t.setAttribute('aria-selected', 'false');
                });
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                tab.setAttribute('aria-selected', 'true');
                document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
            });
        });
    }

    function setupModals() {
        document.getElementById('edit-rules-btn').addEventListener('click', openRulesModal);
        document.getElementById('close-rules').addEventListener('click', closeRulesModal);
        document.getElementById('save-rules').addEventListener('click', saveRulesFromModal);
        document.getElementById('reset-rules').addEventListener('click', resetRules);
        document.getElementById('export-rules').addEventListener('click', exportRules);
        document.getElementById('import-rules').addEventListener('change', (e) => {
            if (e.target.files[0]) importRules(e.target.files[0]);
        });
        document.getElementById('save-budget').addEventListener('click', saveBudgetValues);
        document.getElementById('load-budget').addEventListener('click', loadBudgetFromStorage);
        document.getElementById('export-excel').addEventListener('click', exportToExcel);
        document.getElementById('outlier-threshold').addEventListener('change', renderOutliers);
        document.getElementById('outlier-fixed-amount').addEventListener('change', renderOutliers);
        document.querySelectorAll('input[name="outlier-mode"]').forEach(radio => {
            radio.addEventListener('change', renderOutliers);
        });
    }

    // ---- File Handling ----
    function handleFile(file) {
        if (!file.name.endsWith('.csv')) {
            alert('Please upload a CSV file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const parsed = parseCSV(e.target.result);
            if (parsed.length === 0) {
                alert('No valid transactions found in ' + file.name + '. Please check the format.');
                return;
            }

            // Suggest a name based on file or account number
            const suggestedName = accounts.length === 0 ? 'Personal' : 'Account ' + (accounts.length + 1);

            const account = {
                name: suggestedName,
                fileName: file.name,
                transactions: parsed
            };
            accounts.push(account);

            updateAccountsUI();
            refreshTransactions();
            document.getElementById('dashboard').classList.remove('hidden');
        };
        reader.readAsText(file);
    }

    function updateAccountsUI() {
        const listEl = document.getElementById('accounts-list');
        const infoEl = document.getElementById('file-info');

        infoEl.textContent = `✓ ${accounts.reduce((sum, a) => sum + a.transactions.length, 0)} total transactions across ${accounts.length} account(s)`;
        infoEl.classList.remove('hidden');

        listEl.innerHTML = accounts.map((acc, i) => {
            return `<div class="account-item">
                <input type="text" value="${acc.name}" data-index="${i}" aria-label="Account name" class="account-name-input">
                <span class="account-file">${acc.fileName} (${acc.transactions.length} transactions)</span>
                <button class="account-remove" data-index="${i}" title="Remove account" aria-label="Remove ${acc.name}">✕</button>
            </div>`;
        }).join('');
        listEl.classList.remove('hidden');

        // Name change handlers
        listEl.querySelectorAll('.account-name-input').forEach(input => {
            input.addEventListener('change', (e) => {
                accounts[parseInt(e.target.dataset.index)].name = e.target.value;
                updateAccountFilter();
                refreshTransactions();
            });
        });

        // Remove handlers
        listEl.querySelectorAll('.account-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                accounts.splice(parseInt(e.target.dataset.index), 1);
                updateAccountsUI();
                refreshTransactions();
                if (accounts.length === 0) {
                    document.getElementById('dashboard').classList.add('hidden');
                }
            });
        });

        updateAccountFilter();
    }

    function updateAccountFilter() {
        const filter = document.getElementById('account-filter');
        const current = filter.value;
        filter.innerHTML = '<option value="all">All Accounts</option>' +
            accounts.map((acc, i) => `<option value="${i}">${acc.name}</option>`).join('');
        filter.value = current;

        // Re-attach listener (safe to do multiple times with replaceWith trick)
        const newFilter = filter.cloneNode(true);
        filter.parentNode.replaceChild(newFilter, filter);
        newFilter.addEventListener('change', () => {
            activeAccount = newFilter.value;
            refreshTransactions();
        });
    }

    function refreshTransactions() {
        if (activeAccount === 'all') {
            transactions = accounts.flatMap(acc =>
                acc.transactions.map(tx => ({ ...tx, accountName: acc.name }))
            );
        } else {
            const idx = parseInt(activeAccount);
            if (accounts[idx]) {
                transactions = accounts[idx].transactions.map(tx => ({ ...tx, accountName: accounts[idx].name }));
            } else {
                transactions = [];
            }
        }

        // Re-categorize
        transactions.forEach(tx => {
            tx.category = categorize(tx);
            tx.isTransfer = isInternalTransfer(tx);
        });

        // Sort by date
        transactions.sort((a, b) => a.date - b.date);

        if (transactions.length > 0) {
            renderDashboard();
        }
    }

    // ---- Rendering ----
    function renderDashboard() {
        const monthly = getMonthlyData();
        const monthKeys = Object.keys(monthly).sort();

        renderSummary(monthly, monthKeys);
        renderMonthlyTable(monthly, monthKeys);
        renderMonthlyChart(monthly, monthKeys);
        renderCategories();
        renderOutliers();
        renderSavings(monthly, monthKeys);
        renderBudget(monthly, monthKeys);
        renderTransactions();
        populateFilters(monthKeys);
    }

    function renderSummary(monthly, monthKeys) {
        // Current balance (last transaction)
        const lastTx = transactions[transactions.length - 1];
        document.getElementById('current-balance').textContent = formatCurrency(lastTx.balance);
        document.getElementById('balance-date').textContent = `as of ${formatDate(lastTx.date)}`;

        // Filter by year if selected
        const yearFilter = document.getElementById('year-filter').value;
        let filteredKeys = monthKeys;
        if (yearFilter !== 'all') {
            filteredKeys = monthKeys.filter(k => k.startsWith(yearFilter));
        }

        const numMonths = filteredKeys.length || 1;
        let totalSpending = 0;
        let totalIncome = 0;

        for (const key of filteredKeys) {
            totalSpending += monthly[key].spending;
            totalIncome += monthly[key].income;
        }

        const avgSpending = totalSpending / numMonths;
        const avgIncome = totalIncome / numMonths;
        const avgSaved = avgIncome - avgSpending;

        document.getElementById('avg-spending').textContent = formatCurrency(avgSpending);
        document.getElementById('avg-income').textContent = formatCurrency(avgIncome);
        document.getElementById('avg-saved').textContent = formatCurrency(avgSaved);
        document.getElementById('avg-saved').className = `amount ${avgSaved >= 0 ? 'positive' : 'negative'}`;

        // Run anomaly detection
        renderWarnings(monthly, monthKeys);
    }

    function renderWarnings(monthly, monthKeys) {
        const warnings = [];

        // 1. Detect duplicate salary payments in same month
        const salaryKeywords = categoryRules['Salary/Income'] || [];
        for (const key of monthKeys) {
            const m = monthly[key];
            const salaryCredits = m.transactions.filter(tx => {
                if (tx.credit < 500) return false; // Ignore small amounts (test payments etc.)
                const desc = tx.description.toUpperCase();
                return salaryKeywords.some(kw => desc.includes(kw.toUpperCase()));
            });

            if (salaryCredits.length > 1) {
                const total = salaryCredits.reduce((sum, tx) => sum + tx.credit, 0);
                warnings.push({
                    type: 'severe',
                    title: `Multiple salary payments in ${getMonthLabel(key)}`,
                    detail: `${salaryCredits.length} salary credits totalling ${formatCurrency(total)} detected. This may indicate a duplicate payment/recall situation. Check if one should be excluded.`
                });
            }
        }

        // 2. Detect months with unusually high income (>2x average)
        const incomeValues = monthKeys.map(k => monthly[k].income).filter(v => v > 0);
        const avgIncome = incomeValues.length > 0 ? incomeValues.reduce((a, b) => a + b, 0) / incomeValues.length : 0;
        for (const key of monthKeys) {
            const m = monthly[key];
            if (avgIncome > 0 && m.income > avgIncome * 2) {
                warnings.push({
                    type: 'warning',
                    title: `Unusually high income in ${getMonthLabel(key)}`,
                    detail: `Income of ${formatCurrency(m.income)} is more than 2× your average (${formatCurrency(avgIncome)}). Check for duplicate payments or one-off credits.`
                });
            }
        }

        // 3. Detect large credits that don't match known income patterns
        const knownIncomeKeywords = [...salaryKeywords, ...(categoryRules['Account Top-Up'] || []), ...(categoryRules['Savings Transfer'] || []), ...(categoryRules['Recall/Reversal'] || [])];
        const unknownLargeCredits = transactions.filter(tx => {
            if (tx.credit < 500) return false;
            const desc = tx.description.toUpperCase();
            return !knownIncomeKeywords.some(kw => desc.includes(kw.toUpperCase()));
        });
        if (unknownLargeCredits.length > 0) {
            warnings.push({
                type: 'warning',
                title: `${unknownLargeCredits.length} unrecognised large credit(s)`,
                detail: `Credits over €500 that don't match salary or known transfer patterns: ${unknownLargeCredits.slice(0, 3).map(tx => `${tx.description} (${formatCurrency(tx.credit)} on ${formatDate(tx.date)})`).join(', ')}${unknownLargeCredits.length > 3 ? '...' : ''}`
            });
        }

        // Render
        const section = document.getElementById('warnings-section');
        if (warnings.length === 0) {
            section.classList.add('hidden');
            return;
        }

        section.classList.remove('hidden');
        section.innerHTML = warnings.map(w => {
            const icon = w.type === 'severe' ? '🚨' : '⚠️';
            return `<div class="warning-item ${w.type}">
                <span class="warning-icon">${icon}</span>
                <div class="warning-text">
                    <strong>${w.title}</strong>
                    ${w.detail}
                </div>
            </div>`;
        }).join('');
    }

    function renderMonthlyTable(monthly, monthKeys) {
        const tbody = document.querySelector('#monthly-table tbody');
        const yearFilter = document.getElementById('year-filter').value;

        let filteredKeys = monthKeys;
        if (yearFilter !== 'all') {
            filteredKeys = monthKeys.filter(k => k.startsWith(yearFilter));
        }

        tbody.innerHTML = filteredKeys.map(key => {
            const m = monthly[key];
            const net = m.income - m.spending;
            return `<tr>
                <td>${getMonthLabel(key)}</td>
                <td>${formatCurrency(m.startBalance)}</td>
                <td class="positive">${formatCurrency(m.income)}</td>
                <td class="negative">${formatCurrency(m.spending)}</td>
                <td>${formatCurrency(m.transfers)}</td>
                <td class="${net >= 0 ? 'positive' : 'negative'}">${formatCurrency(net)}</td>
                <td>${formatCurrency(m.endBalance)}</td>
            </tr>`;
        }).join('');
    }

    function renderMonthlyChart(monthly, monthKeys) {
        const container = document.getElementById('monthly-chart');
        const yearFilter = document.getElementById('year-filter').value;

        let filteredKeys = monthKeys;
        if (yearFilter !== 'all') {
            filteredKeys = monthKeys.filter(k => k.startsWith(yearFilter));
        }

        if (filteredKeys.length === 0) { container.innerHTML = ''; return; }

        const maxVal = Math.max(...filteredKeys.map(k => Math.max(monthly[k].income, monthly[k].spending)));
        const barWidth = Math.max(12, Math.min(30, Math.floor(800 / filteredKeys.length)));

        // Calculate averages
        const avgIncome = filteredKeys.reduce((sum, k) => sum + monthly[k].income, 0) / filteredKeys.length;
        const avgSpending = filteredKeys.reduce((sum, k) => sum + monthly[k].spending, 0) / filteredKeys.length;

        const chartHeight = 250;
        const avgIncomeY = maxVal > 0 ? (1 - avgIncome / maxVal) * (chartHeight - 40) : 0;
        const avgSpendingY = maxVal > 0 ? (1 - avgSpending / maxVal) * (chartHeight - 40) : 0;

        container.innerHTML = `
            <div class="chart-legend">
                <span class="legend-item"><span class="legend-dot income-dot"></span> Income</span>
                <span class="legend-item"><span class="legend-dot spending-dot"></span> Spending</span>
                <span class="legend-item"><span class="legend-line income-line"></span> Avg Income (${formatCurrency(avgIncome)})</span>
                <span class="legend-item"><span class="legend-line spending-line"></span> Avg Spending (${formatCurrency(avgSpending)})</span>
            </div>
            <div class="chart-area" style="height:${chartHeight}px;position:relative;">
                <div class="avg-line income-avg" style="top:${avgIncomeY}px;" title="Avg Income: ${formatCurrency(avgIncome)}"></div>
                <div class="avg-line spending-avg" style="top:${avgSpendingY}px;" title="Avg Spending: ${formatCurrency(avgSpending)}"></div>
                <div class="chart-bars">
                    ${filteredKeys.map(k => {
                        const m = monthly[k];
                        const incH = maxVal > 0 ? (m.income / maxVal) * (chartHeight - 40) : 0;
                        const spendH = maxVal > 0 ? (m.spending / maxVal) * (chartHeight - 40) : 0;
                        const label = getMonthLabel(k).substring(0, 3) + ' ' + k.substring(2, 4);
                        return `<div class="chart-month" title="${getMonthLabel(k)}: Income ${formatCurrency(m.income)}, Spending ${formatCurrency(m.spending)}">
                            <div class="bar-pair">
                                <div class="bar income-bar" style="height:${incH}px;width:${barWidth/2}px;"></div>
                                <div class="bar spending-bar" style="height:${spendH}px;width:${barWidth/2}px;"></div>
                            </div>
                            <div class="chart-month-label">${label}</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function renderCategories() {
        const yearFilter = document.getElementById('category-year-filter').value;
        const monthFilter = document.getElementById('category-month-filter').value;
        const categories = getCategoryData(yearFilter, monthFilter);
        const totalSpending = Object.values(categories).reduce((sum, c) => sum + c.total, 0);

        // Sort by total descending
        const sorted = Object.entries(categories).sort((a, b) => b[1].total - a[1].total);

        // Calculate months for average
        let numMonths = 1;
        if (yearFilter === 'all' && monthFilter === 'all') {
            const monthly = getMonthlyData();
            numMonths = Object.keys(monthly).length || 1;
        } else if (yearFilter !== 'all' && monthFilter === 'all') {
            // Count months in that year
            const monthly = getMonthlyData();
            numMonths = Object.keys(monthly).filter(k => k.startsWith(yearFilter)).length || 1;
        }

        // Grid cards (clickable)
        const grid = document.getElementById('categories-grid');
        grid.innerHTML = sorted.map(([name, data]) => {
            const pct = totalSpending > 0 ? ((data.total / totalSpending) * 100).toFixed(1) : 0;
            const keywords = (categoryRules[name] || []).slice(0, 4).join(', ');
            const moreCount = (categoryRules[name] || []).length - 4;
            const keywordText = keywords + (moreCount > 0 ? ` +${moreCount} more` : '');
            return `<div class="category-card" data-category="${name}" role="button" tabindex="0" aria-label="View ${name} transactions">
                <div class="cat-name">${name}</div>
                <div class="cat-amount">${formatCurrency(data.total)}</div>
                <div class="cat-percent">${pct}% of spending</div>
                <div class="cat-keywords" title="${(categoryRules[name] || []).join(', ')}">${keywordText || 'No keywords (catch-all)'}</div>
            </div>`;
        }).join('');

        // Add click handlers to cards
        grid.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', () => showCategoryDetail(card.dataset.category));
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    showCategoryDetail(card.dataset.category);
                }
            });
        });

        // Table with keywords column
        const tbody = document.querySelector('#categories-table tbody');
        tbody.innerHTML = sorted.map(([name, data]) => {
            const pct = totalSpending > 0 ? ((data.total / totalSpending) * 100).toFixed(1) : 0;
            const avg = data.total / numMonths;
            const keywords = (categoryRules[name] || []).join(', ') || 'Everything else';
            return `<tr class="clickable-row" data-category="${name}">
                <td><strong>${name}</strong></td>
                <td class="keywords-cell" title="${keywords}">${keywords}</td>
                <td class="negative">${formatCurrency(data.total)}</td>
                <td>${pct}%</td>
                <td>${formatCurrency(avg)}</td>
            </tr>`;
        }).join('');

        // Add click handlers to table rows
        tbody.querySelectorAll('.clickable-row').forEach(row => {
            row.addEventListener('click', () => showCategoryDetail(row.dataset.category));
        });

        // Close detail button
        document.getElementById('category-detail-close').addEventListener('click', hideCategoryDetail);
    }

    function showCategoryDetail(categoryName) {
        const yearFilter = document.getElementById('category-year-filter').value;
        const monthFilter = document.getElementById('category-month-filter').value;
        let filteredTx = transactions.filter(tx => tx.debit > 0 && tx.category === categoryName);

        if (yearFilter && yearFilter !== 'all') {
            filteredTx = filteredTx.filter(tx => tx.date.getFullYear().toString() === yearFilter);
        }
        if (monthFilter && monthFilter !== 'all') {
            const monthNum = parseInt(monthFilter, 10);
            filteredTx = filteredTx.filter(tx => (tx.date.getMonth() + 1) === monthNum);
        }

        // Store for sorting
        let currentSort = { col: 'date', dir: 'desc' };
        const detailEl = document.getElementById('category-detail');
        const keywords = (categoryRules[categoryName] || []).join(', ') || 'No specific keywords — catches everything not matched by other categories';
        const total = filteredTx.reduce((sum, tx) => sum + tx.debit, 0);

        document.getElementById('category-detail-title').textContent = `${categoryName} (${filteredTx.length} transactions — Total: ${formatCurrency(total)})`;
        document.getElementById('category-detail-keywords').textContent = `Matched by: ${keywords}`;

        function renderDetailTable(sortCol, sortDir) {
            currentSort = { col: sortCol, dir: sortDir };
            const sorted = [...filteredTx].sort((a, b) => {
                let valA, valB;
                switch (sortCol) {
                    case 'date': valA = a.date; valB = b.date; break;
                    case 'description': valA = a.description.toLowerCase(); valB = b.description.toLowerCase(); break;
                    case 'amount': valA = a.debit; valB = b.debit; break;
                    case 'balance': valA = a.balance; valB = b.balance; break;
                    default: valA = a.date; valB = b.date;
                }
                if (valA < valB) return sortDir === 'asc' ? -1 : 1;
                if (valA > valB) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });

            const arrow = (col) => {
                if (currentSort.col !== col) return ' ↕';
                return currentSort.dir === 'asc' ? ' ↑' : ' ↓';
            };

            const thead = document.querySelector('#category-detail-table thead');
            thead.innerHTML = `<tr>
                <th class="sortable" data-col="date">Date${arrow('date')}</th>
                <th class="sortable" data-col="description">Description${arrow('description')}</th>
                <th class="sortable" data-col="amount">Amount${arrow('amount')}</th>
                <th class="sortable" data-col="balance">Balance${arrow('balance')}</th>
                <th>Move to</th>
            </tr>`;

            const allCats = Object.keys(categoryRules).filter(c => c !== categoryName);
            const tbody = document.querySelector('#category-detail-table tbody');
            tbody.innerHTML = sorted.map(tx => {
                return `<tr>
                    <td>${formatDate(tx.date)}</td>
                    <td>${tx.description}</td>
                    <td class="negative">${formatCurrency(tx.debit)}</td>
                    <td>${formatCurrency(tx.balance)}</td>
                    <td><select class="recategorise-select" data-desc="${tx.description}" aria-label="Move to category">
                        <option value="">—</option>
                        ${allCats.map(c => `<option value="${c}">${c}</option>`).join('')}
                        <option value="__new__">+ New Category</option>
                    </select></td>
                </tr>`;
            }).join('');

            // Attach sort handlers
            thead.querySelectorAll('.sortable').forEach(th => {
                th.addEventListener('click', () => {
                    const col = th.dataset.col;
                    const newDir = (currentSort.col === col && currentSort.dir === 'desc') ? 'asc' : 'desc';
                    renderDetailTable(col, newDir);
                });
            });

            // Attach recategorise handlers
            tbody.querySelectorAll('.recategorise-select').forEach(sel => {
                sel.addEventListener('change', (e) => {
                    let targetCat = e.target.value;
                    const desc = e.target.dataset.desc;
                    if (!targetCat) return;

                    if (targetCat === '__new__') {
                        targetCat = prompt('Enter new category name:');
                        if (!targetCat) { e.target.value = ''; return; }
                        if (!categoryRules[targetCat]) {
                            categoryRules[targetCat] = [];
                        }
                    }

                    // Let user edit the keyword to match broader or narrower
                    const suggested = desc.length > 20 ? desc.substring(0, 20) : desc;
                    const keyword = prompt(
                        `Add keyword to "${targetCat}".\n\nThis will move ALL transactions containing this text.\nEdit to make it broader (e.g. "Sports" instead of "VDP-X3659 Sports E"):`,
                        suggested
                    );
                    if (!keyword) { e.target.value = ''; return; }

                    // Check for exact duplicate keywords in other categories
                    const conflicts = [];
                    for (const [cat, keywords] of Object.entries(categoryRules)) {
                        if (cat === targetCat || cat === 'Other') continue;
                        for (const existingKw of keywords) {
                            if (keyword.toUpperCase() === existingKw.toUpperCase()) {
                                conflicts.push({ category: cat, keyword: existingKw });
                            }
                        }
                    }

                    if (conflicts.length > 0) {
                        const conflictList = conflicts.map(c => `"${c.keyword}" in ${c.category}`).join('\n');
                        const action = confirm(
                            `⚠️ This keyword already exists in another category:\n${conflictList}\n\nClick OK to remove it from there and add it to "${targetCat}".\nClick Cancel to abort.`
                        );
                        if (!action) { e.target.value = ''; return; }

                        // Remove conflicting keywords
                        for (const conflict of conflicts) {
                            const idx = categoryRules[conflict.category].findIndex(
                                kw => kw.toUpperCase() === conflict.keyword.toUpperCase()
                            );
                            if (idx !== -1) {
                                categoryRules[conflict.category].splice(idx, 1);
                            }
                        }
                    }

                    if (!categoryRules[targetCat].some(kw => kw.toUpperCase() === keyword.toUpperCase())) {
                        categoryRules[targetCat].push(keyword);
                    }
                    localStorage.setItem('aib-budget-rules', JSON.stringify(categoryRules));

                    // Re-categorize all transactions
                    transactions.forEach(t => {
                        t.category = categorize(t);
                        t.isTransfer = isInternalTransfer(t);
                    });

                    renderCategories();
                    showCategoryDetail(categoryName);
                });
            });
        }

        // Initial render sorted by amount descending (most useful for finding big items)
        renderDetailTable('amount', 'desc');

        detailEl.classList.remove('hidden');

        // Highlight selected card
        document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
        const selectedCard = document.querySelector(`.category-card[data-category="${categoryName}"]`);
        if (selectedCard) selectedCard.classList.add('selected');

        // Scroll to detail
        detailEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideCategoryDetail() {
        document.getElementById('category-detail').classList.add('hidden');
        document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
    }

    function renderSavings(monthly, monthKeys) {
        const tbody = document.querySelector('#savings-table tbody');
        const chartContainer = document.getElementById('savings-chart');

        // Build savings data
        const savingsData = [];
        for (let i = 0; i < monthKeys.length; i++) {
            const key = monthKeys[i];
            const m = monthly[key];
            // Get start balance: first transaction's balance + its debit - its credit
            const firstTx = m.transactions[0];
            const startBal = firstTx.balance + firstTx.debit - firstTx.credit;
            const endBal = m.endBalance;
            const change = endBal - startBal;
            const changePct = startBal !== 0 ? ((change / startBal) * 100).toFixed(1) : 0;

            savingsData.push({ key, startBal, endBal, change, changePct });
        }

        // Table
        tbody.innerHTML = savingsData.map(d => {
            return `<tr>
                <td>${getMonthLabel(d.key)}</td>
                <td>${formatCurrency(d.startBal)}</td>
                <td>${formatCurrency(d.endBal)}</td>
                <td class="${d.change >= 0 ? 'positive' : 'negative'}">${d.change >= 0 ? '+' : ''}${formatCurrency(d.change)}</td>
                <td class="${d.change >= 0 ? 'positive' : 'negative'}">${d.change >= 0 ? '+' : ''}${d.changePct}%</td>
            </tr>`;
        }).join('');

        // Simple bar chart showing end balance per month
        const maxBal = Math.max(...savingsData.map(d => d.endBal));
        const minBal = Math.min(...savingsData.map(d => d.endBal));
        const range = maxBal - minBal || 1;

        chartContainer.innerHTML = `<div class="chart-bar-container">
            ${savingsData.map(d => {
                const height = Math.max(5, ((d.endBal - minBal) / range) * 85);
                const barClass = d.change >= 0 ? 'positive-change' : 'negative-change';
                return `<div class="chart-bar-wrapper" title="${getMonthLabel(d.key)}: ${formatCurrency(d.endBal)}">
                    <div class="chart-bar ${barClass}" style="height: ${height}%"></div>
                    <div class="chart-label">${getMonthLabel(d.key).substring(0, 3)}</div>
                </div>`;
            }).join('')}
        </div>`;
    }

    function renderBudget(monthly, monthKeys) {
        const filterEl = document.getElementById('budget-month-filter');
        const selectedMonth = filterEl.value === 'latest' ? monthKeys[monthKeys.length - 1] : filterEl.value;

        if (!selectedMonth) return;

        const [budgetYear, budgetMonth] = selectedMonth.split('-');
        const categories = getCategoryData(budgetYear, budgetMonth);
        const allCategories = Object.keys(categoryRules).filter(c => c !== 'Salary/Income' && c !== 'Savings Transfer');

        const tbody = document.querySelector('#budget-table tbody');
        tbody.innerHTML = allCategories.map(cat => {
            const actual = categories[cat] ? categories[cat].total : 0;
            const budget = budgets[cat] || 0;
            const remaining = budget - actual;
            let status = '';
            let statusClass = '';

            if (budget > 0) {
                const pct = (actual / budget) * 100;
                if (pct > 100) { status = 'Over'; statusClass = 'over'; }
                else if (pct > 80) { status = 'Warning'; statusClass = 'warning'; }
                else { status = 'On Track'; statusClass = 'under'; }
            }

            return `<tr>
                <td>${cat}</td>
                <td><input type="number" min="0" step="10" value="${budget}" data-category="${cat}" aria-label="Budget for ${cat}"></td>
                <td class="negative">${formatCurrency(actual)}</td>
                <td class="${remaining >= 0 ? 'positive' : 'negative'}">${budget > 0 ? formatCurrency(remaining) : '-'}</td>
                <td>${budget > 0 ? `<span class="budget-status ${statusClass}">${status}</span>` : '-'}</td>
            </tr>`;
        }).join('');
    }

    function renderTransactions() {
        const yearFilter = document.getElementById('tx-year-filter').value;
        const monthFilter = document.getElementById('tx-month-filter').value;
        const catFilter = document.getElementById('tx-category-filter').value;
        const typeFilter = document.getElementById('tx-type-filter').value;
        const search = document.getElementById('tx-search').value.toLowerCase();

        let filtered = [...transactions];

        if (yearFilter !== 'all') {
            filtered = filtered.filter(tx => tx.date.getFullYear().toString() === yearFilter);
        }
        if (monthFilter !== 'all') {
            const monthNum = parseInt(monthFilter, 10);
            filtered = filtered.filter(tx => (tx.date.getMonth() + 1) === monthNum);
        }
        if (catFilter !== 'all') {
            filtered = filtered.filter(tx => tx.category === catFilter);
        }
        if (typeFilter === 'debit') {
            filtered = filtered.filter(tx => tx.debit > 0);
        } else if (typeFilter === 'credit') {
            filtered = filtered.filter(tx => tx.credit > 0);
        }
        if (search) {
            filtered = filtered.filter(tx => tx.description.toLowerCase().includes(search));
        }

        // Show most recent first
        filtered.sort((a, b) => b.date - a.date);

        // Limit to 500 for performance
        const limited = filtered.slice(0, 500);

        const tbody = document.querySelector('#transactions-table tbody');
        tbody.innerHTML = limited.map(tx => {
            return `<tr>
                <td>${formatDate(tx.date)}</td>
                <td>${tx.description}</td>
                <td>${tx.category}</td>
                <td class="${tx.debit > 0 ? 'negative' : ''}">${tx.debit > 0 ? formatCurrency(tx.debit) : ''}</td>
                <td class="${tx.credit > 0 ? 'positive' : ''}">${tx.credit > 0 ? formatCurrency(tx.credit) : ''}</td>
                <td>${formatCurrency(tx.balance)}</td>
            </tr>`;
        }).join('');

        if (filtered.length > 500) {
            tbody.innerHTML += `<tr><td colspan="6" style="text-align:center;color:var(--text-light)">Showing 500 of ${filtered.length} transactions</td></tr>`;
        }
    }

    // ---- Filters ----
    function populateFilters(monthKeys) {
        // Year filter
        const years = [...new Set(monthKeys.map(k => k.split('-')[0]))];
        const yearFilter = document.getElementById('year-filter');
        yearFilter.innerHTML = '<option value="all">All Years</option>' +
            years.map(y => `<option value="${y}">${y}</option>`).join('');
        yearFilter.addEventListener('change', () => {
            const monthly = getMonthlyData();
            const monthKeys = Object.keys(monthly).sort();
            renderSummary(monthly, monthKeys);
            renderMonthlyTable(monthly, monthKeys);
            renderMonthlyChart(monthly, monthKeys);
        });

        // Month filters (for categories, transactions, budget)
        const allYears = [...new Set(monthKeys.map(k => k.split('-')[0]))];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        const catYearFilter = document.getElementById('category-year-filter');
        catYearFilter.innerHTML = '<option value="all">All Years</option>' +
            allYears.map(y => `<option value="${y}">${y}</option>`).join('');
        catYearFilter.addEventListener('change', () => renderCategories());

        const catMonthFilter = document.getElementById('category-month-filter');
        catMonthFilter.innerHTML = '<option value="all">All Months</option>' +
            monthNames.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
        catMonthFilter.addEventListener('change', () => renderCategories());

        const txYearFilter = document.getElementById('tx-year-filter');
        txYearFilter.innerHTML = '<option value="all">All Years</option>' +
            allYears.map(y => `<option value="${y}">${y}</option>`).join('');
        txYearFilter.addEventListener('change', () => renderTransactions());

        const txMonthFilter = document.getElementById('tx-month-filter');
        txMonthFilter.innerHTML = '<option value="all">All Months</option>' +
            monthNames.map((name, i) => `<option value="${i + 1}">${name}</option>`).join('');
        txMonthFilter.addEventListener('change', () => renderTransactions());

        // Category filter for transactions
        const allCats = [...new Set(transactions.map(tx => tx.category))].sort();
        const txCatFilter = document.getElementById('tx-category-filter');
        txCatFilter.innerHTML = '<option value="all">All Categories</option>' +
            allCats.map(c => `<option value="${c}">${c}</option>`).join('');
        txCatFilter.addEventListener('change', () => renderTransactions());

        // Type filter
        document.getElementById('tx-type-filter').addEventListener('change', () => renderTransactions());

        // Search
        document.getElementById('tx-search').addEventListener('input', debounce(() => renderTransactions(), 300));

        // Budget month filter
        const budgetMonthFilter = document.getElementById('budget-month-filter');
        budgetMonthFilter.innerHTML = '<option value="latest">Latest Month</option>' +
            monthKeys.slice().reverse().map(k => `<option value="${k}">${getMonthLabel(k)}</option>`).join('');
        budgetMonthFilter.addEventListener('change', () => {
            const monthly = getMonthlyData();
            renderBudget(monthly, Object.keys(monthly).sort());
        });
    }

    // ---- Rules Modal ----
    function openRulesModal() {
        const editor = document.getElementById('rules-editor');
        editor.innerHTML = Object.entries(categoryRules).map(([category, keywords]) => {
            return `<div class="rule-group">
                <h4>${category} <button class="delete-cat-btn" data-category="${category}" title="Delete category">✕</button></h4>
                <textarea data-category="${category}" aria-label="Keywords for ${category}">${keywords.join(', ')}</textarea>
            </div>`;
        }).join('') + `<div class="add-category-group">
            <input type="text" id="new-category-name" placeholder="New category name..." aria-label="New category name">
            <button id="add-category-btn" class="btn btn-secondary">+ Add Category</button>
        </div>`;

        // Add category handler
        editor.querySelector('#add-category-btn').addEventListener('click', () => {
            const name = document.getElementById('new-category-name').value.trim();
            if (!name) { alert('Enter a category name'); return; }
            if (categoryRules[name]) { alert('Category already exists'); return; }
            categoryRules[name] = [];
            localStorage.setItem('aib-budget-rules', JSON.stringify(categoryRules));
            openRulesModal(); // Refresh modal
        });

        // Delete category handlers
        editor.querySelectorAll('.delete-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const cat = e.target.dataset.category;
                if (cat === 'Other') { alert('Cannot delete the catch-all category'); return; }
                if (confirm(`Delete "${cat}"? Its transactions will move to Other.`)) {
                    delete categoryRules[cat];
                    localStorage.setItem('aib-budget-rules', JSON.stringify(categoryRules));
                    openRulesModal(); // Refresh modal
                }
            });
        });

        // Populate merge select
        const mergeFrom = document.getElementById('merge-from');
        mergeFrom.innerHTML = Object.keys(categoryRules)
            .map(c => `<option value="${c}">${c}</option>`).join('');

        // Merge handler
        document.getElementById('merge-btn').onclick = () => {
            const selected = Array.from(mergeFrom.selectedOptions).map(o => o.value);
            const target = document.getElementById('merge-target').value.trim();

            if (selected.length < 2) { alert('Select at least 2 categories to merge.'); return; }
            if (!target) { alert('Enter a target category name.'); return; }

            // Combine all keywords into target
            const combinedKeywords = [];
            for (const cat of selected) {
                if (categoryRules[cat]) {
                    combinedKeywords.push(...categoryRules[cat]);
                }
            }

            // Remove old categories (except if one of them IS the target)
            for (const cat of selected) {
                if (cat !== target) {
                    delete categoryRules[cat];
                }
            }

            // Set target keywords (merge with existing if target already exists)
            if (categoryRules[target]) {
                categoryRules[target] = [...new Set([...categoryRules[target], ...combinedKeywords])];
            } else {
                categoryRules[target] = [...new Set(combinedKeywords)];
            }

            localStorage.setItem('aib-budget-rules', JSON.stringify(categoryRules));

            // Re-categorize
            transactions.forEach(t => {
                t.category = categorize(t);
                t.isTransfer = isInternalTransfer(t);
            });

            renderCategories();
            openRulesModal(); // Refresh the modal
            alert(`Merged ${selected.length} categories into "${target}"`);
        };

        document.getElementById('rules-modal').classList.remove('hidden');
    }

    function closeRulesModal() {
        document.getElementById('rules-modal').classList.add('hidden');
    }

    function saveRulesFromModal() {
        const textareas = document.querySelectorAll('#rules-editor textarea');
        const newRules = {};
        textareas.forEach(ta => {
            const category = ta.dataset.category;
            const keywords = ta.value.split(',').map(k => k.trim()).filter(Boolean);
            newRules[category] = keywords;
        });
        categoryRules = newRules;
        localStorage.setItem('aib-budget-rules', JSON.stringify(categoryRules));

        // Re-categorize all transactions
        transactions.forEach(tx => {
            tx.category = categorize(tx);
            tx.isTransfer = isInternalTransfer(tx);
        });

        renderDashboard();
        closeRulesModal();
    }

    function resetRules() {
        if (confirm('Reset all category rules to defaults?')) {
            categoryRules = JSON.parse(JSON.stringify(DEFAULT_RULES));
            localStorage.setItem('aib-budget-rules', JSON.stringify(categoryRules));
            transactions.forEach(tx => {
                tx.category = categorize(tx);
                tx.isTransfer = isInternalTransfer(tx);
            });
            renderDashboard();
            closeRulesModal();
        }
    }

    function exportRules() {
        const data = JSON.stringify(categoryRules, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'aib-budget-categories.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    function importRules(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const imported = JSON.parse(e.target.result);
                if (typeof imported !== 'object' || Array.isArray(imported)) {
                    alert('Invalid file format. Expected a JSON object with category names and keyword arrays.');
                    return;
                }
                categoryRules = imported;
                localStorage.setItem('aib-budget-rules', JSON.stringify(categoryRules));
                transactions.forEach(tx => {
                    tx.category = categorize(tx);
                    tx.isTransfer = isInternalTransfer(tx);
                });
                renderDashboard();
                openRulesModal();
                alert('Rules imported successfully!');
            } catch (err) {
                alert('Error reading file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ---- Budget Storage ----
    function saveBudgetValues() {
        const inputs = document.querySelectorAll('#budget-table input[type="number"]');
        inputs.forEach(input => {
            budgets[input.dataset.category] = parseFloat(input.value) || 0;
        });
        localStorage.setItem('aib-budget-values', JSON.stringify(budgets));
        alert('Budget saved!');
        const monthly = getMonthlyData();
        renderBudget(monthly, Object.keys(monthly).sort());
    }

    function loadBudgetFromStorage() {
        const stored = localStorage.getItem('aib-budget-values');
        if (stored) {
            budgets = JSON.parse(stored);
            const monthly = getMonthlyData();
            renderBudget(monthly, Object.keys(monthly).sort());
            alert('Budget loaded!');
        } else {
            alert('No saved budget found.');
        }
    }

    // ---- Excel Export ----
    function exportToExcel() {
        if (transactions.length === 0) {
            alert('No data to export. Please upload a CSV first.');
            return;
        }

        const wb = XLSX.utils.book_new();

        // Sheet 1: All Transactions with categories
        const txData = transactions.map(tx => ({
            'Date': formatDate(tx.date),
            'Description': tx.description,
            'Category': tx.category,
            'Is Transfer': tx.isTransfer ? 'Yes' : 'No',
            'Debit': tx.debit || '',
            'Credit': tx.credit || '',
            'Balance': tx.balance,
            'Account': tx.accountName || 'Personal'
        }));
        // Sort by date descending for the export
        txData.sort((a, b) => {
            const da = a['Date'].split('/').reverse().join('');
            const db = b['Date'].split('/').reverse().join('');
            return db.localeCompare(da);
        });
        const ws1 = XLSX.utils.json_to_sheet(txData);
        XLSX.utils.book_append_sheet(wb, ws1, 'All Transactions');

        // Sheet 2: Spending only (no transfers, no credits)
        const spendingData = transactions
            .filter(tx => tx.debit > 0 && !tx.isTransfer)
            .map(tx => ({
                'Date': formatDate(tx.date),
                'Description': tx.description,
                'Category': tx.category,
                'Amount': tx.debit,
                'Account': tx.accountName || 'Personal'
            }));
        spendingData.sort((a, b) => b['Amount'] - a['Amount']);
        const ws2 = XLSX.utils.json_to_sheet(spendingData);
        XLSX.utils.book_append_sheet(wb, ws2, 'Spending Only');

        // Sheet 3: Category Summary
        const categories = getCategoryData('all', 'all');
        const monthly = getMonthlyData();
        const numMonths = Object.keys(monthly).length || 1;
        const totalSpending = Object.values(categories).reduce((sum, c) => sum + c.total, 0);
        const catData = Object.entries(categories)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([name, data]) => ({
                'Category': name,
                'Total Spent': data.total,
                '% of Spending': totalSpending > 0 ? ((data.total / totalSpending) * 100).toFixed(1) + '%' : '0%',
                'Avg per Month': +(data.total / numMonths).toFixed(2),
                'Transaction Count': data.count,
                'Keywords': (categoryRules[name] || []).join(', ') || 'Catch-all'
            }));
        const ws3 = XLSX.utils.json_to_sheet(catData);
        XLSX.utils.book_append_sheet(wb, ws3, 'Category Summary');

        // Sheet 4: Monthly Summary
        const monthKeys = Object.keys(monthly).sort();
        const monthData = monthKeys.map(key => ({
            'Month': getMonthLabel(key),
            'Income': monthly[key].income,
            'Spending': monthly[key].spending,
            'Transfers': monthly[key].transfers,
            'Net': monthly[key].income - monthly[key].spending,
            'End Balance': monthly[key].endBalance
        }));
        const ws4 = XLSX.utils.json_to_sheet(monthData);
        XLSX.utils.book_append_sheet(wb, ws4, 'Monthly Summary');

        // Download
        XLSX.writeFile(wb, 'AIB_Budget_Export.xlsx');
    }

    // ---- Outliers ----

    function getOutliers() {
        const mode = document.querySelector('input[name="outlier-mode"]:checked').value;
        const spendingTx = transactions.filter(tx => tx.debit > 0 && !tx.isTransfer);

        let outliers = [];

        if (mode === 'fixed') {
            const fixedAmount = parseFloat(document.getElementById('outlier-fixed-amount').value) || 1000;
            outliers = spendingTx
                .filter(tx => tx.debit > fixedAmount)
                .map(tx => ({
                    ...tx,
                    txId: getTxId(tx),
                    categoryAvg: null,
                    multiplier: null,
                    overAmount: tx.debit
                }));
        } else {
            const threshold = parseFloat(document.getElementById('outlier-threshold').value) || 2;
            // Calculate average per category
            const catTotals = {};
            const catCounts = {};

            for (const tx of spendingTx) {
                if (!catTotals[tx.category]) {
                    catTotals[tx.category] = 0;
                    catCounts[tx.category] = 0;
                }
                catTotals[tx.category] += tx.debit;
                catCounts[tx.category]++;
            }

            const catAvg = {};
            for (const cat of Object.keys(catTotals)) {
                catAvg[cat] = catCounts[cat] > 0 ? catTotals[cat] / catCounts[cat] : 0;
            }

            for (const tx of spendingTx) {
                const avg = catAvg[tx.category] || 0;
                if (avg > 0 && tx.debit > avg * threshold) {
                    outliers.push({
                        ...tx,
                        txId: getTxId(tx),
                        categoryAvg: avg,
                        multiplier: tx.debit / avg,
                        overAmount: tx.debit
                    });
                }
            }
        }

        // Sort by amount descending
        outliers.sort((a, b) => b.debit - a.debit);
        return outliers;
    }

    function renderOutliers() {
        const mode = document.querySelector('input[name="outlier-mode"]:checked').value;
        const outliers = getOutliers();

        document.getElementById('outlier-count').textContent = `${outliers.length} items flagged`;

        const tbody = document.querySelector('#outliers-table tbody');
        tbody.innerHTML = outliers.map(tx => {
            const isExcluded = excludedTxIds.has(tx.txId);
            const rowClass = isExcluded ? 'outlier-row excluded' : 'outlier-row';
            const btnClass = isExcluded ? 'exclude-toggle excluded' : 'exclude-toggle included';
            const btnText = isExcluded ? 'Excluded' : 'Included';

            const avgCell = mode === 'multiplier' ? `<td>${formatCurrency(tx.categoryAvg)}</td>` : `<td>-</td>`;
            const multCell = mode === 'multiplier' ? `<td>${tx.multiplier.toFixed(1)}×</td>` : `<td>-</td>`;

            return `<tr class="${rowClass}">
                <td>${formatDate(tx.date)}</td>
                <td>${tx.description}</td>
                <td>${tx.category}</td>
                <td class="negative">${formatCurrency(tx.debit)}</td>
                ${avgCell}
                ${multCell}
                <td><button class="${btnClass}" data-txid="${tx.txId}">${btnText}</button></td>
            </tr>`;
        }).join('');

        // Toggle handlers
        tbody.querySelectorAll('.exclude-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const txId = btn.dataset.txid;
                if (excludedTxIds.has(txId)) {
                    excludedTxIds.delete(txId);
                } else {
                    excludedTxIds.add(txId);
                }
                saveExcluded();
                renderOutliers();
                // Re-render affected views
                const monthly = getMonthlyData();
                const monthKeys = Object.keys(monthly).sort();
                renderSummary(monthly, monthKeys);
                renderMonthlyTable(monthly, monthKeys);
                renderCategories();
            });
        });

        // Bulk actions
        document.getElementById('exclude-all-outliers').onclick = () => {
            outliers.forEach(tx => excludedTxIds.add(tx.txId));
            saveExcluded();
            renderOutliers();
            const monthly = getMonthlyData();
            const monthKeys = Object.keys(monthly).sort();
            renderSummary(monthly, monthKeys);
            renderMonthlyTable(monthly, monthKeys);
            renderCategories();
        };

        document.getElementById('include-all-outliers').onclick = () => {
            outliers.forEach(tx => excludedTxIds.delete(tx.txId));
            saveExcluded();
            renderOutliers();
            const monthly = getMonthlyData();
            const monthKeys = Object.keys(monthly).sort();
            renderSummary(monthly, monthKeys);
            renderMonthlyTable(monthly, monthKeys);
            renderCategories();
        };
    }

    // ---- Helpers ----
    function formatCurrency(amount) {
        return '€' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function formatDate(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    function debounce(fn, delay) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function loadRules() {
        const stored = localStorage.getItem('aib-budget-rules');
        if (stored) {
            try { return JSON.parse(stored); } catch (e) { /* fall through */ }
        }
        return JSON.parse(JSON.stringify(DEFAULT_RULES));
    }

    function loadBudgets() {
        const stored = localStorage.getItem('aib-budget-values');
        if (stored) {
            try { return JSON.parse(stored); } catch (e) { /* fall through */ }
        }
        return {};
    }

})();

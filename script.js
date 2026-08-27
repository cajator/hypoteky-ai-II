// --- STATE MANAGEMENT ---
const state = {
    mode: 'express',
    formData: {
        propertyValue: 5000000, loanAmount: 4000000, income: 60000, 
        loanTerm: 30, fixation: 5, age: 35, children: 0, liabilities: 0,
        purpose: 'koupě', propertyType: 'byt', employment: 'zaměstnanec', education: 'středoškolské'
    },
    calculation: null,
    chatHistory: [],
    isAiTyping: false,
    chartInstance: null
};

// --- HELPERS ---
const formatCurrency = (n) => new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n);

const createSlider = (id, label, value, min, max, step, info) => `
    <div class="mb-5">
        <div class="flex justify-between items-center mb-2">
            <label class="text-sm font-extrabold text-slate-700 flex items-center gap-1">${label} ${info ? `<span class="info-icon" data-tooltip="${info}">?</span>` : ''}</label>
            <span class="font-black text-blue-700 bg-blue-50 px-2 py-1 rounded-lg text-sm border border-blue-100" id="val-${id}">${id.includes('Term')||id.includes('age')||id.includes('fixation')?value+' let':(id==='children'?value:formatCurrency(value))}</span>
        </div>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" class="w-full custom-slider" oninput="handleInput('${id}', this.value)">
    </div>
`;
const createSelect = (id, label, options, selected) => `
    <div class="mb-5">
        <label class="block text-sm font-extrabold text-slate-700 mb-2">${label}</label>
        <select id="${id}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-sm" onchange="handleInput('${id}', this.value)">
            ${Object.entries(options).map(([k,v]) => `<option value="${k}" ${k===selected?'selected':''}>${v}</option>`).join('')}
        </select>
    </div>
`;

// --- RENDER FORM ---
const renderForm = () => {
    const container = document.getElementById('calculator-form');
    if (state.mode === 'express') {
        container.innerHTML = `
            ${createSlider('propertyValue', 'Hodnota nemovitosti', state.formData.propertyValue, 1000000, 20000000, 100000, 'Odhadní cena nemovitosti')}
            ${createSlider('loanAmount', 'Výše úvěru', state.formData.loanAmount, 500000, 20000000, 100000, 'Kolik peněz si chcete půjčit')}
            ${createSlider('income', 'Čistý měsíční příjem', state.formData.income, 20000, 250000, 1000, 'Společný příjem všech žadatelů')}
            ${createSlider('loanTerm', 'Splatnost', state.formData.loanTerm, 5, 30, 1)}
        `;
    } else {
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                ${createSelect('employment', 'Typ příjmu', {'zaměstnanec':'Zaměstnanec', 'osvč':'OSVČ', 'jednatel':'Jednatel s.r.o.'}, state.formData.employment)}
                ${createSelect('purpose', 'Účel', {'koupě':'Koupě', 'výstavba':'Výstavba', 'refinancování':'Refinancování'}, state.formData.purpose)}
                ${createSelect('education', 'Nejvyšší vzdělání', {'středoškolské':'Středoškolské', 'vysokoškolské':'Vysokoškolské'}, state.formData.education)}
            </div>
            <div class="mt-2 pt-6 border-t border-slate-100">
                ${createSlider('propertyValue', 'Hodnota nemovitosti', state.formData.propertyValue, 1000000, 20000000, 100000)}
                ${createSlider('loanAmount', 'Výše úvěru', state.formData.loanAmount, 500000, 20000000, 100000)}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                    ${createSlider('income', 'Čistý příjem', state.formData.income, 20000, 250000, 1000)}
                    ${createSlider('liabilities', 'Jiné splátky měsíčně', state.formData.liabilities, 0, 100000, 500)}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-x-6">
                    ${createSlider('loanTerm', 'Splatnost', state.formData.loanTerm, 5, 30, 1)}
                    ${createSlider('fixation', 'Fixace', state.formData.fixation, 3, 10, 1)}
                    ${createSlider('age', 'Věk', state.formData.age, 18, 65, 1)}
                </div>
            </div>
        `;
    }
    setupTooltips();
};

window.handleInput = (id, val) => {
    state.formData[id] = isNaN(val) ? val : parseInt(val);
    const el = document.getElementById(`val-${id}`);
    if (el) {
        if(id.includes('Term')||id.includes('age')||id.includes('fixation')) el.textContent = val + ' let';
        else if(id === 'children') el.textContent = val;
        else if(!isNaN(val)) el.textContent = formatCurrency(val);
    }
    clearTimeout(window.calcTimeout);
    window.calcTimeout = setTimeout(fetchRates, 600);
};

// --- SCORE WIDGET ---
const renderScoreBar = (lbl, val, expl, color) => `
    <div class="p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div class="flex justify-between items-end mb-2">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">${lbl}</span>
            <span class="font-black text-xl text-slate-900">${val}%</span>
        </div>
        <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
            <div class="h-full ${color} transition-all duration-700" style="width: ${Math.min(val,100)}%"></div>
        </div>
        <p class="text-[11px] font-semibold text-slate-500 leading-tight">${expl}</p>
    </div>
`;

// --- RENDER RESULTS ---
const renderResults = () => {
    const res = document.getElementById('results-container');
    const calc = state.calculation;
    if (!calc || !calc.offers || calc.offers.length === 0) {
        res.innerHTML = `<div class="p-8 bg-red-50 border border-red-200 rounded-2xl text-center"><div class="text-4xl mb-3">⚠️</div><h3 class="font-extrabold text-red-900 text-lg mb-1">Nelze zafinancovat bankou</h3><p class="text-sm text-red-700 font-medium">Vaše zadané LTV překračuje 90 % nebo je splátka příliš vysoká vůči příjmům (DSTI).</p></div>`;
        return;
    }

    const app = calc.approvability;
    const best = calc.offers[0];
    const fix = calc.fixationDetails;

    const ltvColor = app.ltv > 80 ? 'bg-green-500' : (app.ltv > 50 ? 'bg-yellow-500' : 'bg-red-500');
    const dstiColor = app.dsti > 70 ? 'bg-blue-500' : 'bg-orange-500';

    let html = `
        <h3 class="text-xl font-extrabold mb-4 flex items-center gap-2">🎯 Skóre schvalitelnosti</h3>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
            ${renderScoreBar('LTV', app.ltv, 'Poměr úvěru k zástavě', ltvColor)}
            ${renderScoreBar('DSTI', app.dsti, 'Zatížení příjmů splátkami', dstiColor)}
            ${renderScoreBar('Bonita', app.bonita, 'Celková spolehlivost', 'bg-purple-500')}
        </div>

        <div class="bg-gradient-to-br from-slate-900 to-slate-800 p-8 rounded-3xl text-white shadow-2xl relative overflow-hidden mb-8">
            <div class="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-4 py-1.5 rounded-bl-xl tracking-wider uppercase">Vítězná nabídka</div>
            <h3 class="text-3xl font-extrabold mb-2">${best.title}</h3>
            <p class="text-slate-400 text-sm font-medium mb-8 max-w-sm">${best.description}</p>
            
            <div class="flex flex-col sm:flex-row justify-between items-center bg-white/5 p-6 rounded-2xl backdrop-blur-md border border-white/10">
                <div class="text-center sm:text-left mb-4 sm:mb-0">
                    <div class="text-xs uppercase tracking-widest font-bold text-slate-400 mb-1">Měsíční splátka</div>
                    <div class="text-4xl font-black text-white">${formatCurrency(best.monthlyPayment)}</div>
                </div>
                <div class="text-center sm:text-right">
                    <div class="text-xs uppercase tracking-widest font-bold text-slate-400 mb-1">Úroková sazba</div>
                    <div class="text-3xl font-bold text-green-400">${best.rate.toFixed(2)} % p.a.</div>
                </div>
            </div>
        </div>`;

    if (fix) {
        html += `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 class="font-extrabold text-slate-900 mb-4">Analýza fixace (${state.formData.fixation} let)</h4>
                <div class="flex justify-between text-sm font-semibold mb-3 pb-3 border-b border-slate-100"><span class="text-slate-500">Zaplatíte celkem:</span> <strong>${formatCurrency(fix.totalPaymentsInFixation)}</strong></div>
                <div class="flex justify-between text-sm font-semibold mb-3 pb-3 border-b border-slate-100"><span class="text-slate-500">Čistý náklad (Úroky):</span> <strong class="text-red-500">${formatCurrency(fix.totalInterestForFixation)}</strong></div>
                <div class="flex justify-between text-sm font-semibold pt-1"><span class="text-slate-500">Zbývající dluh:</span> <strong class="text-blue-600">${formatCurrency(fix.remainingBalanceAfterFixation)}</strong></div>
            </div>
            <div class="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 class="font-extrabold text-slate-900 mb-4">Vývoj úroků vs jistina</h4>
                <div class="h-32"><canvas id="chart"></canvas></div>
            </div>
        </div>`;
    }

    res.innerHTML = html;

    if (fix && typeof Chart !== 'undefined') {
        const ctx = document.getElementById('chart').getContext('2d');
        if (state.chartInstance) state.chartInstance.destroy();
        const yData = Array.from({length: 5}, (_, i) => ({ year: i+1, i: (best.monthlyPayment*12)*0.7*(1-i/15), p: (best.monthlyPayment*12)*0.3*(1+i/15) }));
        state.chartInstance = new Chart(ctx, {
            type: 'bar', data: { labels: yData.map(d=>d.year+'r'), datasets: [{label:'Úrok', data:yData.map(d=>d.i), backgroundColor:'#ef4444', borderRadius:4}, {label:'Jistina', data:yData.map(d=>d.p), backgroundColor:'#22c55e', borderRadius:4}] },
            options: { responsive:true, maintainAspectRatio:false, scales:{x:{stacked:true, display:false}, y:{stacked:true, display:false}}, plugins:{legend:{display:false}} }
        });
    }

    document.getElementById('manual-financial-fields')?.classList.add('hidden');
};

const fetchRates = async () => {
    document.getElementById('results-container').innerHTML = `<div class="p-16 flex justify-center"><div class="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600"></div></div>`;
    try {
        const res = await fetch(`/.netlify/functions/rates?${new URLSearchParams(state.formData).toString()}`);
        if (!res.ok) throw new Error('API');
        state.calculation = await res.json();
        renderResults();
    } catch(e) {
        document.getElementById('results-container').innerHTML = `<div class="p-6 bg-red-50 text-red-700 rounded-xl font-bold border border-red-200">Chyba připojení k serveru. Nelze načíst sazby.</div>`;
    }
};

// --- CHAT LOGIC ---
const appendChat = (text, sender) => {
    const w = document.createElement('div');
    w.className = `flex w-full ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
    let pt = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    if (pt.includes('showLeadForm')) {
        pt = `Otevírám formulář pro spojení s expertem. <strong><a href="#" onclick="document.getElementById('lead-modal').classList.remove('hidden'); return false;" class="text-blue-600 underline">Případně klikněte zde</a></strong>.`;
        setTimeout(()=>document.getElementById('lead-modal').classList.remove('hidden'), 1000);
    }
    w.innerHTML = `<div class="${sender === 'user' ? 'bubble-user' : 'bubble-ai'}">${pt}</div>`;
    
    // Používáme přímé volání getElementById, abychom zamezili chybám s chybějícími proměnnými
    const chatMsgs = document.getElementById('chat-messages');
    chatMsgs.appendChild(w);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
    
    if(sender !== 'system') state.chatHistory.push({sender, text});
};

document.getElementById('chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('chat-input');
    const msg = inputEl.value.trim();
    if (!msg || state.isAiTyping) return;
    
    appendChat(msg, 'user');
    inputEl.value = '';
    state.isAiTyping = true;
    
    const tid = `t-${Date.now()}`;
    const tw = document.createElement('div');
    tw.id = tid; tw.className = `flex w-full justify-start`;
    tw.innerHTML = `<div class="bubble-ai flex space-x-1 items-center h-8"><div class="w-2 h-2 bg-slate-300 rounded-full animate-bounce"></div><div class="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style="animation-delay:0.2s"></div></div>`;
    const chatMsgs = document.getElementById('chat-messages');
    chatMsgs.appendChild(tw);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;

    try {
        const payload = { message: msg, context: { formData: state.formData, calculation: state.calculation, chatHistory: state.chatHistory.slice(-5) } };
        const res = await fetch('/.netlify/functions/chat', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        
        document.getElementById(tid).remove();
        state.isAiTyping = false;
        
        if(!res.ok) throw new Error('API');
        const data = await res.json();
        
        if (data.tool === 'showLeadForm') { 
            document.getElementById('lead-modal').classList.remove('hidden');
            appendChat('Otevírám kontakt.', 'ai'); 
        } else { 
            appendChat(data.response || data, 'ai'); 
        }
    } catch(err) {
        document.getElementById(tid)?.remove();
        state.isAiTyping = false;
        appendChat('Chyba spojení s AI. Spojte se s expertem pomocí tlačítka v menu.', 'ai');
    }
});

const generateSuggestions = () => {
    const sug = document.getElementById('ai-suggestions');
    const texts = ["Jak zlepšit skóre?", "Jsem OSVČ", "Co je DSTI?", "Změnit fixaci"];
    sug.innerHTML = texts.map(t => `<button type="button" class="text-xs font-bold bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-full whitespace-nowrap hover:border-blue-300 hover:text-blue-600 transition-all" onclick="document.getElementById('chat-input').value='${t}'; document.getElementById('chat-form').dispatchEvent(new Event('submit'))">${t}</button>`).join('');
};

// --- TOOLTIPS ---
const setupTooltips = () => {
    const icons = document.querySelectorAll('.info-icon');
    const tooltip = document.getElementById('tooltip-container');
    icons.forEach(i => {
        i.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = e.target.dataset.tooltip; tooltip.classList.remove('hidden');
            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = `${rect.left + window.scrollX}px`; tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
        });
        i.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
    });
};

// --- TABS & FORM SUBMIT ---
document.getElementById('mode-express').addEventListener('click', (e) => {
    state.mode = 'express';
    e.target.className = "px-6 py-2 text-sm font-bold bg-white text-slate-900 shadow-sm rounded-lg transition-all";
    document.getElementById('mode-guided').className = "px-6 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors";
    renderForm(); fetchRates();
});
document.getElementById('mode-guided').addEventListener('click', (e) => {
    state.mode = 'guided';
    e.target.className = "px-6 py-2 text-sm font-bold bg-white text-slate-900 shadow-sm rounded-lg transition-all";
    document.getElementById('mode-express').className = "px-6 py-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors";
    renderForm(); fetchRates();
});

document.getElementById('lead-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-lead-btn');
    btn.disabled = true; btn.textContent = 'Odesílám...';
    const fd = new FormData(e.target);
    const p = new URLSearchParams();
    for (const pair of fd.entries()) p.append(pair[0], pair[1]);
    p.append('extraData', JSON.stringify({ formData: state.formData, calculation: state.calculation, chatHistory: state.chatHistory }));

    try {
        await fetch('/.netlify/functions/form-handler', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
        document.getElementById('lead-form').classList.add('hidden');
        document.getElementById('form-success').classList.remove('hidden');
    } catch(err) {
        btn.disabled = false; btn.textContent = 'Odeslat nezávazně ke zpracování';
        alert('Chyba odeslání. Zkuste to prosím znovu.');
    }
});

// INIT (Zavolá funkce bezpečně poté, co je načten DOM z konce body tagu)
renderForm(); 
fetchRates(); 
generateSuggestions();
setTimeout(() => appendChat('Dobrý den! Analyzuji vaše skóre v reálném čase. S čím vám mohu poradit?', 'ai'), 800);

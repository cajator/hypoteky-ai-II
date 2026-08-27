// --- STATE MANAGEMENT ---
const state = {
    mode: 'express',
    formData: {
        propertyValue: 5000000, loanAmount: 4000000, income: 60000, 
        loanTerm: 30, fixation: 5, age: 35, children: 0, liabilities: 0,
        purpose: 'koupě', propertyType: 'byt', employment: 'zaměstnanec', education: 'středoškolské', landValue: 0, reconstructionValue: 0
    },
    calculation: null,
    chatHistory: [],
    isAiTyping: false,
    chartInstance: null
};

// --- QUICK RESPONSES (BEZ ČEKÁNÍ NA API) ---
const QUICK_RESPONSES = {
    'dokumenty|potřebuji|doklady|podklady': `<strong>📋 Zde je seznam dokumentů:</strong><br>• Platný občanský průkaz<br>• Potvrzení o příjmu (nebo daňové přiznání)<br>• Výpisy z účtu za poslední 3 měsíce<br>• Návrh kupní smlouvy<br>💡 <em>Tip: S přípravou dokumentů vám rád pomůže náš specialista.</em>`,
    'kolik.*půjčit|maximální.*úvěr|jakou.*částku': `<strong>💰 Kolik si můžete půjčit:</strong><br>Hrubý odhad je <strong>váš čistý měsíční příjem × 9 let</strong> (tedy x 108 měsíců).<br>Např. při příjmu 50 000 Kč dosáhnete cca na 4,5 mil. Kč.<br>💡 <em>Tip: Přesná částka závisí i na vašem věku a dalších půjčkách. Můžete si to otestovat přímo v naší detailní kalkulačce vlevo!</em>`,
    'osvč|podnikatel|živnost': `<strong>🏢 Hypotéka pro OSVČ:</strong><br>Standardně banky berou čistý zisk z daňového přiznání. My však umíme u vybraných bank zařídit <strong>výpočet z obratu (15-25%)</strong>. To je ideální pro ty, kteří legálně optimalizují daně paušálem.<br>💡 <em>Tip: Vyplňte formulář pod kalkulačkou a náš expert vám najde správnou banku.</em>`,
    'fixaci|změnit fixaci': `<strong>🔒 Jakou zvolit fixaci:</strong><br>Dnes se nejčastěji volí <strong>3 nebo 5 let</strong>. Umožňuje to flexibilně reagovat na případný pokles sazeb v budoucnu a hypotéku případně zdarma refinancovat.`,
    'dsti|co je dsti': `<strong>📊 Co je DSTI:</strong><br>Zkratka pro <em>Debt Service To Income</em>. Vyjadřuje, kolik procent z vašeho čistého příjmu spolkne splátka hypotéky a všech vašich ostatních úvěrů. Bezpečný limit bank je typicky 45 % až 50 %.`,
    'ltv|co je ltv': `<strong>🏠 Co je LTV:</strong><br>Zkratka pro <em>Loan To Value</em> (Poměr úvěru k hodnotě nemovitosti). Pokud kupujete byt za 5 mil. Kč a máte 1 mil. Kč ze svého, půjčujete si 4 mil. Kč, což odpovídá LTV 80 % (ideální stav).`
};

const findQuickResponse = (msg) => {
    const low = msg.toLowerCase();
    for (const [pattern, res] of Object.entries(QUICK_RESPONSES)) {
        if (new RegExp(pattern, 'i').test(low)) return res;
    }
    return null;
}

// --- HELPERS ---
const formatNumber = (n, currency = true) => Number(n).toLocaleString('cs-CZ', currency ? { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 } : { maximumFractionDigits: 0 });

const createSlider = (id, label, value, min, max, step, containerClass = '', infoText = '') => {
    let suffix = ' Kč';
    if (id.includes('Term') || id.includes('age') || id.includes('fixation')) suffix = ' let';
    else if (id.includes('children')) suffix = '';

    const infoIcon = infoText ? `<span class="info-icon text-blue-500 hover:text-blue-700 ml-1 cursor-pointer" data-tooltip="${infoText}">?</span>` : '';

    return `
    <div class="${containerClass} mb-5" id="${id}-group">
        <div class="flex justify-between items-center mb-2 gap-2">
            <label for="${id}" class="text-sm font-extrabold text-slate-700 flex items-center">
                ${label} ${infoIcon}
            </label>
            <div class="flex items-center gap-1">
                <input type="text" id="${id}-input" value="${formatNumber(value, false)}" class="font-black text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1.5 rounded-lg text-right w-28 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-inner" onchange="handleInput('${id}', this.value, 'text')">
                <span class="text-sm font-bold text-slate-500 w-6">${suffix}</span>
            </div>
        </div>
        <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}" class="w-full custom-slider" oninput="handleInput('${id}', this.value, 'range')">
    </div>`;
};

const createSelect = (id, label, options, selectedValue, containerClass = '') => {
    const optionsHTML = Object.entries(options).map(([key, val]) => 
        `<option value="${key}" ${key === selectedValue ? 'selected' : ''}>${val}</option>`
    ).join('');
    return `
    <div class="${containerClass} mb-5">
        <label for="${id}" class="block text-sm font-extrabold text-slate-700 mb-2">${label}</label>
        <select id="${id}" class="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-blue-500 focus:bg-white transition-all shadow-sm cursor-pointer" onchange="handleSelect('${id}', this.value)">
            ${optionsHTML}
        </select>
    </div>`;
};

// --- RENDER FORM ---
const renderForm = () => {
    const container = document.getElementById('calculator-form');
    if (state.mode === 'express') {
        container.innerHTML = `
            ${createSlider('propertyValue', 'Hodnota nemovitosti', state.formData.propertyValue, 1000000, 20000000, 100000, '', 'Kupní nebo odhadní cena nemovitosti.')}
            ${createSlider('loanAmount', 'Výše úvěru', state.formData.loanAmount, 500000, 20000000, 100000, '', 'Částka, kterou si potřebujete půjčit.')}
            ${createSlider('income', 'Čistý měsíční příjem', state.formData.income, 20000, 250000, 1000, '', 'Společný čistý příjem žadatelů.')}
            ${createSlider('loanTerm', 'Doba splácení', state.formData.loanTerm, 5, 30, 1)}
            <div class="mt-6 pt-4 border-t border-slate-100 text-center"><div id="ltv-display" class="font-extrabold text-lg transition-colors duration-300"></div></div>
        `;
    } else {
        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                ${createSelect('employment', 'Typ příjmu', {'zaměstnanec':'Zaměstnanec', 'osvč':'OSVČ', 'jednatel':'Jednatel s.r.o.'}, state.formData.employment)}
                ${createSelect('purpose', 'Účel hypotéky', {'koupě':'Koupě', 'výstavba':'Výstavba', 'rekonstrukce':'Rekonstrukce', 'refinancování':'Refinancování'}, state.formData.purpose)}
                ${createSelect('propertyType', 'Typ nemovitosti', {'byt':'Byt', 'rodinný dům':'Rodinný dům', 'pozemek':'Pozemek'}, state.formData.propertyType)}
                ${createSelect('education', 'Nejvyšší vzdělání', {'základní':'Základní', 'středoškolské':'Středoškolské', 'vysokoškolské':'Vysokoškolské'}, state.formData.education)}
            </div>
            <div class="mt-4 pt-6 border-t border-slate-200">
                ${createSlider('propertyValue', 'Hodnota nemovitosti / stavby', state.formData.propertyValue, 500000, 30000000, 100000)}
                ${createSlider('landValue', 'Hodnota pozemku', state.formData.landValue, 0, 10000000, 50000, 'hidden')}
                ${createSlider('reconstructionValue', 'Rozsah rekonstrukce', state.formData.reconstructionValue, 0, 10000000, 50000, 'hidden')}
                <div id="total-property-value-display" class="hidden text-center bg-slate-100 p-2 rounded-lg text-sm mb-4"></div>
                ${createSlider('loanAmount', 'Požadovaná výše úvěru', state.formData.loanAmount, 500000, 30000000, 100000)}
                <div id="ltv-display" class="text-center font-extrabold text-lg mb-6 transition-colors duration-300"></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                    ${createSlider('income', 'Čistý příjem', state.formData.income, 15000, 300000, 1000)}
                    ${createSlider('liabilities', 'Jiné splátky (úvěry)', state.formData.liabilities, 0, 100000, 500)}
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-x-6">
                    ${createSlider('loanTerm', 'Splatnost', state.formData.loanTerm, 5, 30, 1)}
                    ${createSlider('fixation', 'Fixace', state.formData.fixation, 3, 10, 1)}
                    ${createSlider('age', 'Věk', state.formData.age, 18, 70, 1)}
                </div>
                ${createSlider('children', 'Počet dětí', state.formData.children, 0, 10, 1)}
            </div>
        `;
    }
    handleGuidedFormLogic();
    updateLTVDisplay();
    setupTooltips();
    generateSuggestions();
};

const handleGuidedFormLogic = () => {
    if (state.mode === 'express') return;
    const purpose = state.formData.purpose;
    const landValueGroup = document.getElementById('landValue-group');
    const reconstructionValueGroup = document.getElementById('reconstructionValue-group');
    
    if (purpose === 'výstavba') {
        landValueGroup?.classList.remove('hidden'); reconstructionValueGroup?.classList.add('hidden'); state.formData.reconstructionValue = 0;
    } else if (purpose === 'rekonstrukce') {
        reconstructionValueGroup?.classList.remove('hidden'); landValueGroup?.classList.add('hidden'); state.formData.landValue = 0;
    } else {
        landValueGroup?.classList.add('hidden'); reconstructionValueGroup?.classList.add('hidden'); state.formData.landValue = 0; state.formData.reconstructionValue = 0;
    }
};

const updateLTVDisplay = () => {
    const { loanAmount, propertyValue, landValue, purpose } = state.formData;
    const effectiveValue = (state.mode === 'guided' && purpose === 'výstavba') ? propertyValue + landValue : propertyValue;
    const ltv = effectiveValue > 0 ? Math.round((loanAmount / effectiveValue) * 100) : 0;
    
    const display = document.getElementById('ltv-display');
    if (display) {
        display.textContent = `Aktuální LTV: ${ltv}%`;
        display.className = `text-center font-extrabold text-lg mb-6 transition-colors duration-300 ${ltv > 90 ? 'text-red-600' : (ltv > 80 ? 'text-yellow-600' : 'text-green-600')}`;
    }

    const totalValueDisplay = document.getElementById('total-property-value-display');
    if (totalValueDisplay) {
        totalValueDisplay.innerHTML = `Celková budoucí hodnota: <strong>${formatNumber(effectiveValue, true)}</strong>`;
        if (state.mode === 'guided' && purpose === 'výstavba') totalValueDisplay.classList.remove('hidden');
        else totalValueDisplay.classList.add('hidden');
    }
};

window.handleInput = (id, val, type) => {
    let parsedVal = parseInt(String(val).replace(/[^0-9]/g, '')) || 0;
    state.formData[id] = parsedVal;
    
    if (type === 'range') {
        const textInput = document.getElementById(`${id}-input`);
        if (textInput) textInput.value = formatNumber(parsedVal, false);
    } else {
        const slider = document.getElementById(id);
        if (slider) slider.value = parsedVal;
        const textInput = document.getElementById(`${id}-input`);
        if (textInput) textInput.value = formatNumber(parsedVal, false);
    }
    updateLTVDisplay();
    clearTimeout(window.calcTimeout);
    window.calcTimeout = setTimeout(fetchRates, 600);
};

window.handleSelect = (id, val) => {
    state.formData[id] = val;
    if (id === 'purpose') handleGuidedFormLogic();
    updateLTVDisplay();
    generateSuggestions(); 
    clearTimeout(window.calcTimeout);
    window.calcTimeout = setTimeout(fetchRates, 600);
};

const renderScoreBar = (label, val, explanation, colorClass, icon) => `
    <div class="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
        <div class="flex justify-between items-end mb-2">
            <span class="text-xs font-bold text-slate-500 uppercase flex items-center gap-1">${icon} ${label}</span>
            <span class="font-black text-xl text-slate-900">${val}%</span>
        </div>
        <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden mb-2">
            <div class="h-full ${colorClass} transition-all duration-700" style="width: ${Math.min(val,100)}%"></div>
        </div>
        <p class="text-[11px] font-semibold text-slate-400">${explanation}</p>
    </div>
`;

const renderResults = () => {
    const res = document.getElementById('results-container');
    const calc = state.calculation;

    if (!calc || !calc.offers || calc.offers.length === 0) {
        res.innerHTML = `<div class="p-8 bg-red-50 border border-red-200 rounded-2xl text-center"><div class="text-4xl mb-3">⚠️</div><h3 class="font-extrabold text-red-900 text-lg mb-1">Nelze zafinancovat bankou</h3><p class="text-sm text-red-700 font-medium">Vaše zadané LTV překračuje 90 % nebo je splátka příliš vysoká vůči příjmům (DSTI).</p></div>`;
        return;
    }

    const app = calc.approvability;
    const best = state.calculation.selectedOffer || calc.offers[0];
    const fix = calc.fixationDetails;

    const ltvColor = app.ltv > 80 ? 'bg-green-500' : (app.ltv > 50 ? 'bg-yellow-500' : 'bg-red-500');
    const dstiColor = app.dsti > 70 ? 'bg-blue-500' : 'bg-orange-500';

    let html = `
        <h3 class="text-2xl font-extrabold mb-4 text-slate-900">🎯 Skóre schvalitelnosti</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 bg-slate-50 p-4 rounded-2xl border border-slate-100">
            ${renderScoreBar('LTV', app.ltv, 'Poměr úvěru k zástavě', ltvColor, '🏠')}
            ${renderScoreBar('DSTI', app.dsti, 'Zatížení příjmů splátkami', dstiColor, '💰')}
            ${renderScoreBar('Bonita', app.bonita, 'Celková spolehlivost', 'bg-purple-500', '⭐')}
        </div>

        <div class="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden mb-8 transform transition-all hover:scale-[1.01]">
            <div class="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-xs font-bold px-4 py-1.5 rounded-bl-xl tracking-wider uppercase shadow-sm">Vítězná nabídka</div>
            <h3 class="text-3xl font-extrabold mb-2">${best.title}</h3>
            <p class="text-blue-100 text-sm font-medium mb-6 max-w-md">${best.description}</p>
            
            <div class="flex flex-col sm:flex-row justify-between items-center bg-white/10 p-6 rounded-2xl backdrop-blur-md border border-white/20">
                <div class="text-center sm:text-left mb-4 sm:mb-0">
                    <div class="text-xs uppercase tracking-widest font-bold text-blue-200 mb-1">Měsíční splátka</div>
                    <div class="text-4xl font-black text-white">${formatNumber(best.monthlyPayment)}</div>
                </div>
                <div class="text-center sm:text-right border-t sm:border-t-0 sm:border-l border-white/10 pt-4 sm:pt-0 sm:pl-6">
                    <div class="text-xs uppercase tracking-widest font-bold text-blue-200 mb-1">Úroková sazba</div>
                    <div class="text-3xl font-bold text-yellow-400">${best.rate.toFixed(2)} % p.a.</div>
                </div>
            </div>
        </div>`;

    if (calc.offers.length > 1) {
        html += `
        <div class="mb-10">
            <h4 class="text-lg font-bold mb-3 text-slate-800">🧠 Další varianty trhu</h4>
            <div class="overflow-x-auto rounded-xl border border-slate-200">
                <table class="w-full bg-white text-sm text-left">
                    <thead class="bg-slate-50 border-b border-slate-200">
                        <tr><th class="px-4 py-3 font-bold text-slate-700">Varianta</th><th class="px-4 py-3 font-bold text-slate-700 text-right">Měsíční splátka</th><th class="px-4 py-3 font-bold text-slate-700 text-right">Úrok</th></tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        ${calc.offers.map((o, i) => `
                            <tr class="hover:bg-blue-50 cursor-pointer transition-colors ${o.id === best.id ? 'bg-blue-50/50' : ''}" onclick="selectOffer('${o.id}')">
                                <td class="px-4 py-4 font-bold text-blue-700">${i===0?'🏆 ':''}${o.title}</td>
                                <td class="px-4 py-4 text-right font-black text-lg text-slate-900">${formatNumber(o.monthlyPayment)}</td>
                                <td class="px-4 py-4 text-right font-bold text-blue-600">${o.rate.toFixed(2)} %</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    if (fix) {
        html += `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 class="font-extrabold text-slate-900 mb-4 flex items-center gap-2"><span class="text-xl">📊</span> Detail fixace na ${state.formData.fixation} let</h4>
                <div class="space-y-3">
                    <div class="flex justify-between text-sm font-semibold pb-3 border-b border-slate-200"><span class="text-slate-500">Zaplatíte celkem:</span> <strong class="text-slate-900">${formatNumber(fix.totalPaymentsInFixation)}</strong></div>
                    <div class="flex justify-between text-sm font-semibold pb-3 border-b border-slate-200"><span class="text-slate-500">Z toho čisté úroky:</span> <strong class="text-red-500">${formatNumber(fix.totalInterestForFixation)}</strong></div>
                    <div class="flex justify-between text-sm font-semibold pt-1"><span class="text-slate-500">Zbývající dluh:</span> <strong class="text-blue-700 text-base">${formatNumber(fix.remainingBalanceAfterFixation)}</strong></div>
                </div>
            </div>
            <div class="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h4 class="font-extrabold text-slate-900 mb-4 flex items-center gap-2"><span class="text-xl">📈</span> Úroky vs. Jistina</h4>
                <div class="h-40"><canvas id="chart"></canvas></div>
            </div>
        </div>`;
    }

    res.innerHTML = html;

    // --- ANUITNÍ GRAF ---
    if (fix && typeof Chart !== 'undefined') {
        const ctx = document.getElementById('chart').getContext('2d');
        if (state.chartInstance) state.chartInstance.destroy();
        
        const payment = best.monthlyPayment * 12; 
        const rate = best.rate / 100;
        let balance = state.formData.loanAmount;
        const yearsToShow = Math.min(state.formData.fixation, 10); 
        const yData = [];

        for (let year = 1; year <= yearsToShow; year++) {
            let yearInterest = 0;
            let yearPrincipal = 0;
            for(let m = 0; m < 12; m++) {
                const interest = balance * (rate / 12);
                const principal = (payment / 12) - interest;
                yearInterest += interest;
                yearPrincipal += principal;
                balance -= principal;
            }
            yData.push({ year, i: yearInterest, p: yearPrincipal });
        }

        state.chartInstance = new Chart(ctx, {
            type: 'bar', 
            data: { 
                labels: yData.map(d=>d.year+'. rok'), 
                datasets: [
                    {label:'Úroky', data:yData.map(d=>d.i), backgroundColor:'#ef4444', borderRadius:0}, 
                    {label:'Jistina (Mizí dluh)', data:yData.map(d=>d.p), backgroundColor:'#22c55e', borderRadius:0}
                ] 
            },
            options: { 
                responsive:true, maintainAspectRatio:false, 
                scales:{
                    x:{stacked:true, grid:{display:false}}, 
                    y:{stacked:true, display:false}
                }, 
                plugins:{legend:{position:'bottom', labels:{boxWidth:12, font:{size:11}}}} 
            }
        });
    }

    // Pro formulář dole nastavíme extraData
    const extraInputs = document.querySelectorAll('.extraDataInput');
    extraInputs.forEach(inp => {
        inp.value = JSON.stringify({ formData: state.formData, calculation: state.calculation });
    });
};

window.selectOffer = (id) => {
    state.calculation.selectedOffer = state.calculation.offers.find(o => o.id === id);
    renderResults();
};

const fetchRates = async () => {
    document.getElementById('results-container').innerHTML = `<div class="p-16 flex justify-center"><div class="animate-spin rounded-full h-10 w-10 border-b-4 border-blue-600"></div></div>`;
    try {
        const res = await fetch(`/.netlify/functions/rates?${new URLSearchParams(state.formData).toString()}`);
        if (!res.ok) throw new Error('API');
        state.calculation = await res.json();
        state.calculation.selectedOffer = state.calculation.offers[0];
        renderResults();
    } catch(e) {
        document.getElementById('results-container').innerHTML = `<div class="p-6 bg-red-50 text-red-700 rounded-xl font-bold border border-red-200 text-center">Chyba připojení k serveru. Nelze načíst sazby.</div>`;
    }
};

// --- CHAT LOGIC ---
const appendChat = (text, sender) => {
    const w = document.createElement('div');
    w.className = `flex w-full ${sender === 'user' ? 'justify-end' : 'justify-start'}`;
    let pt = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    
    if (pt.includes('showLeadForm')) {
        pt = `Rád vás spojím s expertem. Formulář najdete hned pod výsledky, <strong><a href="#kontakt-form" class="text-blue-600 underline">případně klikněte zde</a></strong>.`;
    }
    
    w.innerHTML = `<div class="${sender === 'user' ? 'bubble-user' : 'bubble-ai shadow-sm'}">${pt}</div>`;
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
    
    // Zkusíme nejprve okamžitou odpověď (Quick Response)
    const quickRes = findQuickResponse(msg);
    if (quickRes) {
        appendChat(msg, 'user');
        inputEl.value = '';
        state.isAiTyping = true;
        const tid = `t-${Date.now()}`;
        const tw = document.createElement('div');
        tw.id = tid; tw.className = `flex w-full justify-start`;
        tw.innerHTML = `<div class="bubble-ai shadow-sm flex space-x-1 items-center h-10 px-4"><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div></div>`;
        document.getElementById('chat-messages').appendChild(tw);
        
        setTimeout(() => {
            document.getElementById(tid).remove();
            appendChat(quickRes, 'ai');
            state.isAiTyping = false;
        }, 500);
        return;
    }

    // Pokud nenajdeme instantní odpověď, voláme Google API
    appendChat(msg, 'user');
    inputEl.value = '';
    state.isAiTyping = true;
    
    const tid = `t-${Date.now()}`;
    const tw = document.createElement('div');
    tw.id = tid; tw.className = `flex w-full justify-start`;
    tw.innerHTML = `<div class="bubble-ai shadow-sm flex space-x-1 items-center h-10 px-4"><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.2s"></div><div class="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style="animation-delay:0.4s"></div></div>`;
    const chatMsgs = document.getElementById('chat-messages');
    chatMsgs.appendChild(tw);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;

    try {
        const payload = { message: msg, context: { formData: state.formData, calculation: state.calculation, chatHistory: state.chatHistory.slice(-6) } };
        const res = await fetch('/.netlify/functions/chat', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        
        document.getElementById(tid).remove();
        state.isAiTyping = false;
        
        if(!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Server odmítl požadavek');
        }
        
        const data = await res.json();
        
        if (data.tool === 'showLeadForm') { 
            appendChat('Otevírám kontakt.', 'ai');
            document.getElementById('kontakt-form').scrollIntoView({behavior: 'smooth'});
        } else { 
            appendChat(data.response || data, 'ai'); 
        }
    } catch(err) {
        document.getElementById(tid)?.remove();
        state.isAiTyping = false;
        appendChat(`Chyba API Googlu: ${err.message}. Kontaktujte specialistu přímo přes formulář dole.`, 'ai');
    }
});

const generateSuggestions = () => {
    const sug = document.getElementById('ai-suggestions');
    let texts = ["Vysvětli mi DSTI", "Mám záznam v registru", "Změnit fixaci", "Co je LTV?"];
    
    if (state.formData.employment === 'osvč' || state.formData.employment === 'jednatel') {
        texts = ["Jak banky počítají obrat?", "Nejnižší sazba pro OSVČ?", "Vyžadujete daňové přiznání?"];
    } else if (state.formData.purpose === 'refinancování') {
        texts = ["Jak dlouho dopředu řešit refinancování?", "Kdo platí odhad při refinancování?"];
    } else if (state.formData.purpose === 'výstavba') {
        texts = ["Jak se prokazují faktury?", "Lze ručit jen pozemkem?"];
    }

    sug.innerHTML = texts.map(t => `<button type="button" class="text-xs font-bold bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-full whitespace-nowrap hover:border-blue-500 hover:text-blue-700 transition-all shadow-sm" onclick="document.getElementById('chat-input').value='${t}'; document.getElementById('chat-form').dispatchEvent(new Event('submit'))">${t}</button>`).join('');
};

const setupTooltips = () => {
    const icons = document.querySelectorAll('.info-icon');
    const tooltip = document.getElementById('tooltip-container');
    icons.forEach(i => {
        i.addEventListener('mouseenter', (e) => {
            tooltip.innerHTML = e.target.dataset.tooltip; tooltip.classList.remove('hidden');
            const rect = e.target.getBoundingClientRect();
            tooltip.style.left = `${rect.left + window.scrollX}px`; tooltip.style.top = `${rect.bottom + window.scrollY + 20}px`;
        });
        i.addEventListener('mouseleave', () => tooltip.classList.add('hidden'));
    });
};

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

// OBSLUHA DVOU FORMULÁŘŮ (Modal a Inline)
const handleFormSubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Odesílám...';
    
    const fd = new FormData(e.target);
    const p = new URLSearchParams();
    for (const pair of fd.entries()) p.append(pair[0], pair[1]);
    
    // extraData jsou už naplněná v inputu z renderResults

    try {
        await fetch('/.netlify/functions/form-handler', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: p.toString() });
        e.target.classList.add('hidden');
        const successDiv = e.target.id === 'lead-form' ? document.getElementById('modal-form-success') : document.getElementById('inline-form-success');
        if(successDiv) successDiv.classList.remove('hidden');
    } catch(err) {
        btn.disabled = false; btn.textContent = 'Odeslat nezávazně ke zpracování';
        alert('Chyba odeslání. Zkuste to prosím znovu.');
    }
};

document.getElementById('lead-form')?.addEventListener('submit', handleFormSubmit);
document.getElementById('inline-lead-form')?.addEventListener('submit', handleFormSubmit);

// INIT
renderForm(); 
fetchRates(); 
generateSuggestions();
setTimeout(() => appendChat('Dobrý den! Jsem váš hypoteční stratég s přístupem do metodik 19+ bank. Vidím vaši kalkulaci vedle. Můžete se mě zeptat na to, co potřebujete z hlediska dokládání příjmů nebo optimální fixace.', 'ai'), 800);

// netlify/functions/chat.js
exports.handler = async (event) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
    
    try {
        const { message, context } = JSON.parse(event.body);
        const apiKey = process.env.GEMINI_API_KEY;
        
        if (!apiKey) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Chybí API klíč na serveru.' }) };

        const ltv = context.formData.propertyValue ? Math.round((context.formData.loanAmount / context.formData.propertyValue)*100) : 0;
        const dsti = context.calculation?.selectedOffer ? Math.round((context.calculation.selectedOffer.monthlyPayment / context.formData.income)*100) : 0;
        
        const prompt = `Jsi profesionální hypoteční AI stratég pro Hypoteky Ai. 
        Mluv stručně, v odstavcích, max 3 věty. 
        Pokud klient potřebuje pomoct s konkrétní nabídkou, pobídni ho ať vyplní formulář, který je umístěn hned pod výsledky kalkulačky.
        Pokud LTV > 90% nebo DSTI > 45%, upozorni na problém. U OSVČ zmiň obratové hypotéky.
        Aktuální parametry klienta: Účel: ${context.formData.purpose}, Příjem typ: ${context.formData.employment}. Úvěr ${context.formData.loanAmount} Kč, LTV: ${ltv}%, DSTI: ${dsti}%.
        Dotaz klienta: ${message}`;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        if (!response.ok) {
            const errData = await response.json();
            return { statusCode: response.status, headers, body: JSON.stringify({ error: errData.error?.message || "Neznámá chyba API" }) };
        }

        const data = await response.json();
        const responseText = data.candidates[0].content.parts[0].text.trim();
        return { statusCode: 200, headers, body: JSON.stringify({ response: responseText }) };
    } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: `Chyba: ${e.message}` }) }; }
};

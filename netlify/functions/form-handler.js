// netlify/functions/form-handler.js
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const formatNumber = (n, currency = true) => {
    const num = Number(n);
    if (typeof num !== 'number' || isNaN(num)) return n;
    return num.toLocaleString('cs-CZ', currency ? { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 } : { maximumFractionDigits: 0 });
};

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    try {
        const formData = new URLSearchParams(event.body);
        let extraData = {};
        try { extraData = JSON.parse(formData.get('extraData') || '{}'); } catch(e){}

        // ZPRACOVÁNÍ HISTORIE CHATU A SOUHRNU (z původního kódu)
        let chatHistoryText = 'Žádná historie chatu.';
        if (extraData.chatHistory && extraData.chatHistory.length > 0) {
            chatHistoryText = extraData.chatHistory.map(msg => {
                const sender = msg.sender === 'user' ? 'Klient' : 'AI';
                const safeText = String(msg.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
                return `${sender}: ${safeText}`;
            }).join('\n------\n');
        }

        let formDataSummaryText = 'Nezadáno';
        let calculationSummaryText = 'Nekalkulováno';
        const form = extraData.formData || {};
        
        if (form.loanAmount) {
            const txtUcel = form.purpose || 'Standardní'; 
            const txtTyp = form.propertyType || 'Standardní';
            const txtPrijem = form.income ? formatNumber(form.income) : '?';
            const txtZam = form.employment || '';
            const txtVek = form.age || '?';
            const txtDeti = form.children || '0';
            const txtZavazky = form.liabilities ? formatNumber(form.liabilities) : '0';
            formDataSummaryText = `Účel: ${txtUcel}, Typ: ${txtTyp}, Příjem: ${txtPrijem} (${txtZam}), Věk: ${txtVek} let, Děti: ${txtDeti}, Závazky: ${txtZavazky}`;
        }

        if (extraData.calculation && extraData.calculation.selectedOffer) {
            const calc = extraData.calculation;
            const offer = calc.selectedOffer;
            calculationSummaryText = `Nabídka: ${offer.title}. Skóre: ${calc.approvability ? calc.approvability.total + '%' : '?'} (LTV:${calc.approvability ? calc.approvability.ltv : '?'}, DSTI:${calc.approvability ? calc.approvability.dsti : '?'})`;
        }

        // ZÁPIS DO GOOGLE SHEETS
        if(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
            const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
            const auth = new JWT({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
            const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
            await doc.loadInfo();
            const sheet = doc.sheetsByIndex[0];
            await sheet.addRow({
                'Datum a čas': new Date().toLocaleString('cs-CZ'),
                'Jméno': formData.get('name') || '', 
                'Telefon': formData.get('phone') || '', 
                'E-mail': formData.get('email') || '',
                'PSČ': formData.get('psc') || '', 
                'Úvěr': extraData.formData?.loanAmount || formData.get('manual_loan') || '',
                'Hodnota nemovitosti': extraData.formData?.propertyValue || formData.get('manual_prop') || '',
                'Měsíční splátka': extraData.calculation?.selectedOffer?.monthlyPayment || '',
                'Úroková sazba': extraData.calculation?.selectedOffer?.rate ? `${extraData.calculation.selectedOffer.rate} %` : '',
                'Čistý příjem (Kč)': extraData.formData?.income || '', 
                'Poznámka': formData.get('note') || '',
                'Preferovaný čas': formData.get('contact-time') || '',
                'Historie chatu': chatHistoryText,
                'Parametry (souhrn)': formDataSummaryText,
                'Výsledky (souhrn)': calculationSummaryText
            });
        }

        // NETLIFY EMAILS (odeslání klientovi)
        if (process.env.NETLIFY_EMAILS_SECRET) {
            try {
                await fetch(`${process.env.URL}/.netlify/functions/emails/confirmation`, {
                    method: 'POST',
                    headers: {
                        'netlify-emails-secret': process.env.NETLIFY_EMAILS_SECRET,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: "info@hypotekyai.cz",
                        to: formData.get('email'),
                        subject: "Potvrzení poptávky hypotéky - Hypoteky Ai",
                        parameters: { name: formData.get('name') || 'Kliente' },
                    }),
                });
            } catch (emailError) {
                console.error("Netlify Emails error:", emailError);
            }
        }

        return { statusCode: 200, body: 'Form processed successfully' };
    } catch (error) { return { statusCode: 500, body: `Server Error: ${error.message}` }; }
};

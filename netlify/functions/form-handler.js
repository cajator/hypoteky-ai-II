// netlify/functions/form-handler.js
// VERZE POUZE PRO ZÁPIS DO GOOGLE SHEETS

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Kontroly proměnných prostředí pro Google
if (!process.env.GOOGLE_SHEET_ID) console.error("ERROR: GOOGLE_SHEET_ID není nastaven.");
if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) console.error("ERROR: GOOGLE_SERVICE_ACCOUNT_EMAIL není nastaven.");
if (!process.env.GOOGLE_PRIVATE_KEY) console.error("ERROR: GOOGLE_PRIVATE_KEY není nastaven.");

// === POMOCNÉ FUNKCE ===

// Helper funkce pro formátování čísel (potřebujeme ji pro souhrny)
const formatNumber = (n, currency = true) => {
    const num = Number(n);
    if (typeof num !== 'number' || isNaN(num)) return n;
    return num.toLocaleString('cs-CZ', currency ? { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 } : { maximumFractionDigits: 0 });
};

// === FUNKCE PRO ZÁPIS DO GOOGLE SHEETS ===

async function appendToSheet(data) {
    console.log(">>> appendToSheet: Funkce spustena.");
    try {
        const sheetId = process.env.GOOGLE_SHEET_ID;
        const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
        const privateKeyRaw = process.env.GOOGLE_PRIVATE_KEY;

        if (!sheetId || !clientEmail || !privateKeyRaw) {
            console.error(">>> appendToSheet: CHYBA - Chybí proměnné prostředí (ID, email, nebo klíč)!");
            return false;
        }
        console.log(`>>> appendToSheet: Sheet ID: ${sheetId.substring(0, 5)}... Email: ${clientEmail}`);

        const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
        console.log(">>> appendToSheet: Private key pripraven.");

        const serviceAccountAuth = new JWT({
            email: clientEmail,
            key: privateKey,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        console.log(">>> appendToSheet: JWT Auth objekt vytvoren.");

        const doc = new GoogleSpreadsheet(sheetId, serviceAccountAuth);

        console.log(">>> appendToSheet: Nacitam info o dokumentu...");
        await doc.loadInfo();
        console.log(`>>> appendToSheet: Info o dokumentu nacteno. Nalezeno listu: ${doc.sheetCount}`);

        const sheet = doc.sheetsByIndex[0];
        if (!sheet) {
            console.error(">>> appendToSheet: CHYBA - Nepodařilo se najít první list (index 0)!");
            return false;
        }
        console.log(`>>> appendToSheet: Zapisuji do listu: "${sheet.title}" (Index 0)`);

        // Příprava dat řádku
        const rowData = {
            'Datum a čas': new Date().toLocaleString('cs-CZ'),
            'Jméno': data.name || '',
            'Telefon': data.phone || '',
            'E-mail': data.email || '',
            'PSČ': data.psc || '',
            'Preferovaný čas': data.contactTime || '',
            'Poznámka': data.note || '',
            'Úvěr': data.loanAmount === null ? '' : data.loanAmount,
            'Hodnota nemovitosti': data.effectivePropertyValue === null ? '' : data.effectivePropertyValue,
            'Účel': data.purpose || '',
            'Typ nemovitosti': data.propertyType || '',
            'Měsíční splátka': data.monthlyPayment === null ? '' : data.monthlyPayment,
            'Úroková sazba': data.rate === null ? '' : `${data.rate} %`,
            'Fixace (roky)': data.fixation === null ? '' : data.fixation,
            'Splatnost (roky)': data.loanTerm === null ? '' : data.loanTerm,
            'Typ příjmu': data.employment || '',
            'Čistý příjem (Kč)': data.income === null ? '' : data.income,
            'Jiné splátky (Kč)': data.liabilities === null ? '' : data.liabilities,
            'Věk': data.age === null ? '' : data.age,
            'Počet dětí': data.children === null ? '' : data.children,
            'Historie chatu': data.chatHistoryText || '',
            'Parametry (souhrn)': data.formDataSummary || '',
            'Výsledky (souhrn)': data.calculationSummaryText || ''
        };
        console.log(">>> appendToSheet: Pripravena data pro radek.");

        console.log(">>> appendToSheet: Pridavam radek...");
        await sheet.addRow(rowData);
        console.log(">>> appendToSheet: Radek uspesne pridan do Google Sheet.");
        return true;

    } catch (error) {
        console.error(">>> appendToSheet: ZACHYCENA CHYBA pri zapisu do Google Sheet!");
        console.error(">>> Chyba - Message:", error.message);
        console.error(">>> Chyba - Stack:", error.stack);
        if (error.response && error.response.data) {
             console.error(">>> Chyba - Google API Response Data:", JSON.stringify(error.response.data, null, 2));
        } else if (error.errors) {
             console.error(">>> Chyba - Google API Errors:", JSON.stringify(error.errors, null, 2));
        } else {
             console.error(">>> Chyba - Kompletní objekt:", error);
        }
        return false;
    }
}

// === HLAVNÍ HANDLER FUNKCE ===

exports.handler = async (event) => {
    if (event.httpMethod && event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }
    // Kontrolujeme POUZE Google proměnné
    if (!process.env.GOOGLE_SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
        console.error("Chyba konfigurace serveru - chybí Google proměnné.");
        return { statusCode: 500, body: "Chyba konfigurace serveru." };
    }

    try {
        console.log("Funkce form-handler spuštěna.");
        let name, email, phone, note, contactTime, psc, extraDataString, extraData;

        // Zpracování dat z formuláře
        if (event.httpMethod === 'POST') {
            const formData = new URLSearchParams(event.body);
            name = formData.get('name');
            email = formData.get('email');
            phone = formData.get('phone');
            psc = formData.get('psc');
            contactTime = formData.get('contact-time');
            note = formData.get('note');
            extraDataString = formData.get('extraData');
            // ===== PŘIDEJ TENTO KONTROLNÍ LOG =====
            console.log(">>> KONTROLA FORMULÁŘE: Načtená hodnota 'psc' je:", psc);
            // =======================================
        } else {
             throw new Error("Funkce byla spuštěna neočekávaným způsobem.");
        }

        // Parsování extra dat (chat, kalkulace)
        try {
            extraData = JSON.parse(extraDataString || '{}');
        } catch (e) {
            console.error("Chyba při parsování extraData:", e);
            extraData = { error: "Chyba při parsování dat." };
        }

        // --- PŘÍPRAVA DAT PRO GOOGLE SHEETS ---
        let chatHistoryText = 'Žádná historie chatu.';
        if (extraData.chatHistory && extraData.chatHistory.length > 0) {
            try {
                chatHistoryText = extraData.chatHistory.map(msg => {
                    const sender = msg.sender === 'user' ? 'Klient' : 'AI';
                    const safeText = String(msg.text || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '');
                    const cleanText = safeText.replace(/\[Tlačítko\]/g, '');
                    return `${sender}: ${cleanText}`;
                }).join('\n------\n');
            } catch (e) {
                console.error("Chyba formátování chatu pro Sheets:", e);
                chatHistoryText = 'Chyba při zpracování chatu.';
            }
        }

        // Inicializace hodnot
        let loanAmountValue = null;
        let effectivePropValue = null;
        let monthlyPaymentValue = null;
        let rateValue = null;
        let fixationValue = null;
        let loanTermValue = null;
        let purposeValue = '';
        let propertyTypeValue = '';
        let employmentValue = '';
        let incomeValue = null;
        let liabilitiesValue = null;
        let ageValue = null;
        let childrenValue = null;
        let formDataSummaryText = 'Nezadáno';
        let calculationSummaryText = 'Nekalkulováno';
        let formDataForJson = extraData.formData || {};

        if (extraData.formData) {
            const form = extraData.formData;
            formDataForJson = form;
            
            // Základní mapování
            loanAmountValue = form.loanAmount || null;
            fixationValue = form.fixation || null;
            loanTermValue = form.loanTerm || null;
            purposeValue = form.purpose || '';
            propertyTypeValue = form.propertyType || '';
            employmentValue = form.employment || '';
            incomeValue = form.income || null;
            liabilitiesValue = form.liabilities || null;
            ageValue = form.age || null;
            childrenValue = form.children === undefined ? null : form.children;

            // Výpočet hodnoty nemovitosti
            if (form.propertyValue || form.landValue) {
                if (form.purpose === 'výstavba') {
                    effectivePropValue = (form.propertyValue || 0) + (form.landValue || 0);
                } else {
                    effectivePropValue = form.propertyValue || 0;
                }
            }

            // SOUHRN PARAMETRŮ
            if (form.isManualEntry) {
                // Varianta pro MANUÁLNÍ zadání
                const sumLoan = form.loanAmount ? formatNumber(form.loanAmount) : 'Nezadáno';
                const sumProp = form.propertyValue ? formatNumber(form.propertyValue) : 'Nezadáno';
                formDataSummaryText = `Manuální poptávka - Úvěr: ${sumLoan}, Nemovitost: ${sumProp}`;
            } else {
                // Varianta pro KALKULAČKU (používáme data ze state)
                const txtUcel = form.purpose || 'Standardní'; 
                const txtTyp = form.propertyType || 'Standardní';
                const txtPrijem = form.income !== undefined && form.income !== null ? formatNumber(form.income) : '?';
                
                // Úprava: Pokud je zaměstnanec (default) nebo prázdné, schováme to. Jinak dáme do závorky.
                const rawZam = form.employment || '';
                const txtZamDisplay = (rawZam === 'zaměstnanec' || rawZam === '') ? '' : `(${rawZam})`;

                const txtVek = form.age || '?';
                
                // Úprava: Pokud je 0, vypíšeme "neuvedeno"
                let txtDeti = (form.children === 0 || form.children === '0') ? 'neuvedeno' : form.children;
                if (txtDeti === null || txtDeti === undefined) txtDeti = '?';

                // Úprava: Pokud je 0, vypíšeme "neuvedeno"
                let txtZavazky;
                if (form.liabilities === 0 || form.liabilities === '0' || form.liabilities === null || form.liabilities === undefined) {
                    txtZavazky = 'neuvedeno';
                } else {
                    txtZavazky = formatNumber(form.liabilities);
                }

                // Sestavení textu (pozor, odstranil jsem závorky kolem txtZamDisplay, protože jsou už v proměnné)
                formDataSummaryText = `Účel: ${txtUcel}, Typ: ${txtTyp}, Příjem: ${txtPrijem} ${txtZamDisplay}, Věk: ${txtVek} let, Děti: ${txtDeti}, Závazky: ${txtZavazky}`;
            }

            // Souhrn VÝSLEDKŮ kalkulace
            if (extraData.calculation && extraData.calculation.selectedOffer) {
                const calc = extraData.calculation;
                const offer = calc.selectedOffer;
                
                if (!form.isManualEntry) {
                    monthlyPaymentValue = offer.monthlyPayment || 0;
                    rateValue = offer.rate || 0;
                }
                
                calculationSummaryText = `Nabídka: ${offer.title || '?'}. Skóre: ${calc.approvability ? calc.approvability.total + '%' : '?'} (LTV:${calc.approvability ? calc.approvability.ltv : '?'}, DSTI:${calc.approvability ? calc.approvability.dsti : '?'}, Bon:${calc.approvability ? calc.approvability.bonita : '?'}).`;
                if (calc.fixationDetails) {
                    calculationSummaryText += ` Fixace ${form.fixation} let: Úroky ${formatNumber(calc.fixationDetails.totalInterestForFixation)}`;
                }
            } else {
                calculationSummaryText = '';
            }
        }

        console.log(">>> KONTROLA PŘEDÁNÍ: Proměnná 'psc' má hodnotu:", psc);
        // Sestavení finálních dat pro zápis
        const sheetData = {
            name: name,
            phone: phone,
            email: email,
            psc: psc,
            contactTime: contactTime,
            note: note,
            loanAmount: loanAmountValue,
            effectivePropertyValue: effectivePropValue,
            monthlyPayment: monthlyPaymentValue,
            rate: rateValue,
            fixation: fixationValue,
            loanTerm: loanTermValue,
            purpose: purposeValue,
            propertyType: propertyTypeValue,
            employment: employmentValue,
            income: incomeValue,
            liabilities: liabilitiesValue,
            age: ageValue,
            children: childrenValue,
            chatHistoryText: chatHistoryText,
            formDataSummary: formDataSummaryText,
            calculationSummaryText: calculationSummaryText
        };

        // --- ZÁPIS DO GOOGLE SHEETS (S ČEKÁNÍM A LOGOVÁNÍM) ---
        console.log(">>> Handler: Pripravena data pro Google Sheet, volam appendToSheet...");
        try {
            const sheetWriteSuccess = await appendToSheet(sheetData);
            if (sheetWriteSuccess) {
                console.log(">>> Handler: Zápis do Sheetu dokončen úspěšně.");
            } else {
                 console.warn(">>> Handler: Zápis do Sheetu selhal (viz logy z appendToSheet).");
            }
        } catch (err) {
            console.error(">>> Handler: Chyba behem cekani na appendToSheet:", err.message);
            console.error(">>> Handler: Chyba Stack:", err.stack);
        }
        console.log(">>> Handler: Blok pro zápis do Sheetu dokončen.");
        // --- Konec bloku pro Google Sheets ---

        // --- VŠECHNY BLOKY PRO ODESLÁNÍ E-MAILŮ JSOU ODSTRANĚNY ---

        // Úspěšná odpověď klientovi (prohlížeči)
        console.log(">>> Handler: Funkce form-handler úspěšně dokončena (pouze zápis do Sheetu).");
        return { statusCode: 200, body: 'Form processed successfully' };

    // Zachycení jakékoli neočekávané chyby v handleru
    } catch (error) {
        console.error('>>> Handler: NEČEKANÁ ZÁVAŽNÁ CHYBA ve funkci form-handler:', error);
        return { statusCode: 500, body: `Server Error: ${error.message}` };
    }
}; // Konec funkce exports.handler

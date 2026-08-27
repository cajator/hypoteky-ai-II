// netlify/functions/form-handler.js
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    try {
        const formData = new URLSearchParams(event.body);
        let extraData = {};
        try { extraData = JSON.parse(formData.get('extraData') || '{}'); } catch(e){}

        if(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
            const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
            const auth = new JWT({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: privateKey, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
            const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
            await doc.loadInfo();
            const sheet = doc.sheetsByIndex[0];
            await sheet.addRow({
                'Datum a čas': new Date().toLocaleString('cs-CZ'),
                'Jméno': formData.get('name') || '', 'Telefon': formData.get('phone') || '', 'E-mail': formData.get('email') || '',
                'PSČ': formData.get('psc') || '', 'Úvěr': extraData.formData?.loanAmount || formData.get('manual_loan') || '',
                'Hodnota nemovitosti': extraData.formData?.propertyValue || formData.get('manual_prop') || '',
                'Měsíční splátka': extraData.calculation?.selectedOffer?.monthlyPayment || '',
                'Úroková sazba': extraData.calculation?.selectedOffer?.rate ? `${extraData.calculation.selectedOffer.rate} %` : '',
                'Čistý příjem (Kč)': extraData.formData?.income || '', 'Poznámka': formData.get('note') || ''
            });
        }
        return { statusCode: 200, body: 'Form processed successfully' };
    } catch (error) { return { statusCode: 500, body: `Server Error: ${error.message}` }; }
};

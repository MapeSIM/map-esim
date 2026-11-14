'use client';
import { useState, useEffect } from 'react';

export function ManualPaymentConfigPanel() {
  const [enabled, setEnabled] = useState(false);
  const [accountTitle, setAccountTitle] = useState('');
  const [jazzcash, setJazzcash] = useState('');
  const [easypaisa, setEasypaisa] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountTitle, setBankAccountTitle] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/admin/manual-payment-settings');
      const data = await res.json();
      if (data.success && data.settings) {
        setEnabled(data.settings.MANUAL_PAYMENTS_ENABLED === 'true');
        setAccountTitle(data.settings.MANUAL_ACCOUNT_TITLE || '');
        setJazzcash(data.settings.JAZZCASH_NUMBER || '');
        setEasypaisa(data.settings.EASYPAISA_NUMBER || '');
        setBankName(data.settings.BANK_NAME || '');
        setBankAccountTitle(data.settings.BANK_ACCOUNT_TITLE || '');
        setBankAccountNumber(data.settings.BANK_ACCOUNT_NUMBER || '');
      }
    } catch (err) {
      console.error('Error fetching settings', err);
    }
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setStatusMessage('');
    try {
      const res = await fetch('/api/admin/manual-payment-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          accountTitle,
          jazzcashNumber: jazzcash,
          easypaisaNumber: easypaisa,
          bankName,
          bankAccountTitle,
          bankAccountNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save');
      }

      setStatusMessage('Settings saved successfully!');
      setTimeout(() => setStatusMessage(''), 3000);
    } catch (err) {
      console.error('Error saving settings', err);
      setStatusMessage('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white mb-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-bold">Manual Payment Gateways (JazzCash / EasyPaisa / Bank)</h2>
          <p className="text-sm text-slate-400">Configure manual payment details shown to customers at checkout.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${enabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
            {enabled ? 'MANUAL PAY ON' : 'MANUAL PAY OFF'}
          </span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              checked={enabled} 
              onChange={(e) => setEnabled(e.target.checked)}
              className="sr-only peer" 
            />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Mobile Wallets Account Title</label>
          <input 
            type="text" 
            value={accountTitle} 
            onChange={(e) => setAccountTitle(e.target.value)}
            placeholder="e.g. Muhammad Waqas" 
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">JazzCash Number</label>
          <input 
            type="text" 
            value={jazzcash} 
            onChange={(e) => setJazzcash(e.target.value)}
            placeholder="03124448025" 
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">EasyPaisa Number</label>
          <input 
            type="text" 
            value={easypaisa} 
            onChange={(e) => setEasypaisa(e.target.value)}
            placeholder="03124448025" 
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Bank Name</label>
          <input 
            type="text" 
            value={bankName} 
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Meezan Bank" 
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Bank Account Title</label>
          <input 
            type="text" 
            value={bankAccountTitle} 
            onChange={(e) => setBankAccountTitle(e.target.value)}
            placeholder="Muhammad Ayaz" 
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1">Bank Account Number / IBAN</label>
          <input 
            type="text" 
            value={bankAccountNumber} 
            onChange={(e) => setBankAccountNumber(e.target.value)}
            placeholder="02350113417568" 
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between border-t border-slate-800 pt-4">
        <div>
          {statusMessage && (
            <p className={`text-xs font-semibold ${statusMessage.includes('success') ? 'text-emerald-400' : 'text-rose-400'}`}>
              {statusMessage}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleSaveAll}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
        >
          {saving ? 'Saving Changes...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { AxiosError } from 'axios';
import { api } from '../../lib/api';
import { CreditCard, ArrowUpRight, ArrowDownRight, RefreshCw, Send } from 'lucide-react';
import toast from 'react-hot-toast';

interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'transfer';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
}

export const PaymentsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState<'deposit' | 'withdraw' | 'transfer' | null>(null);
  const [amount, setAmount] = useState('');
  const [recipientId, setRecipientId] = useState('');

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await api.get('/payments/transactions');
      setTransactions(response.data.transactions);
    } catch (error) {
      console.error('Failed to load transactions', error);
      toast.error('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, []);

  const handleTransactionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || isNaN(Number(amount))) {
      toast.error('Invalid amount');
      return;
    }

    if (showModal === 'transfer' && !recipientId) {
      toast.error('Recipient ID required');
      return;
    }

    setSubmitting(true);
    try {
      let response;

      if (showModal === 'deposit') {
        response = await api.post('/payments/deposit', { amount: Number(amount) });
        toast.success('Deposit successful');
      } else if (showModal === 'withdraw') {
        response = await api.post('/payments/withdraw', { amount: Number(amount) });
        toast.success('Withdrawal request submitted');
      } else if (showModal === 'transfer') {
        response = await api.post('/payments/transfer', { amount: Number(amount), recipientId });
        toast.success('Transfer successful');
      }

      setShowModal(null);
      setAmount('');
      setRecipientId('');

      if (response?.data?.transaction) {
        setTransactions((prev) => [response.data.transaction, ...prev]);
      } else {
        toast.error('Deposit succeeded but no transaction was returned from the server. Refreshing history.');
      }

      await fetchTransactions();
    } catch (error) {
      const axiosErr = error as AxiosError<{ message?: string }>;
      toast.error(axiosErr.response?.data?.message || 'Transaction failed');
    } finally {
      setSubmitting(false);
    }
  };

  const getIcon = (type: string) => {
    if (type === 'deposit') return <ArrowDownRight className="text-green-500" />;
    if (type === 'withdraw') return <ArrowUpRight className="text-red-500" />;
    if (type === 'transfer') return <Send className="text-blue-500" />;
    return <RefreshCw />;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-8">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Payments & Billing</h1>
          <p className="text-gray-500">Manage your transactions and funds.</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-3 sm:space-y-0 w-full md:w-auto">
          <button
            onClick={() => setShowModal('deposit')}
            className="w-full sm:w-auto bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition flex items-center justify-center"
          >
            <ArrowDownRight size={18} className="mr-2" /> Deposit
          </button>
          <button
            onClick={() => setShowModal('withdraw')}
            className="w-full sm:w-auto bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition flex items-center justify-center"
          >
            <ArrowUpRight size={18} className="mr-2" /> Withdraw
          </button>
          <button
            onClick={() => setShowModal('transfer')}
            className="w-full sm:w-auto bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition flex items-center justify-center"
          >
            <Send size={18} className="mr-2" /> Transfer
          </button>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Transaction History</h3>
            <p className="text-sm text-gray-500">Your latest deposits, withdrawals, and transfers.</p>
          </div>
          <button
            type="button"
            onClick={fetchTransactions}
            className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading transactions...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Recipient</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500">
                      <CreditCard size={36} className="mx-auto text-gray-400 mb-4" />
                      No transactions yet. Make a deposit, withdraw, or transfer to see activity here.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center">
                            {getIcon(tx.type)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 capitalize">{tx.type}</p>
                            <p className="text-xs text-gray-500">{new Date(tx.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {tx.type === 'deposit' ? '+' : '-'}${Number(tx.amount).toFixed(2)} {tx.currency?.toUpperCase()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm capitalize text-gray-600">{tx.status}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(tx.createdAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {tx.recipientId || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4 capitalize">{showModal} Funds</h2>
            <form onSubmit={handleTransactionSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  required
                  min="1"
                  step="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              
              {showModal === 'transfer' && (
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Recipient ID</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={recipientId}
                    onChange={(e) => setRecipientId(e.target.value)}
                    placeholder="Enter user ID"
                  />
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  className="w-full sm:w-auto px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
                  disabled={submitting}
                >
                  {submitting ? 'Processing...' : `Confirm ${showModal}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

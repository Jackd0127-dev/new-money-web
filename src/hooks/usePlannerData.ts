import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  addCreditCard,
  addCreditCardPot,
  addCreditCardRepayment,
  addCustomPayment,
  addDailyBrief,
  addDebt,
  addDebtPayment,
  addDebtReserve,
  addPot,
  addRecurringPayment,
  addTransaction,
  archiveCreditCard,
  applyCreditCardPot,
  applyDebtReserve,
  cancelDebtReserve,
  createPaycheckPlan,
  deleteCustomPayment,
  deleteCreditCardPot,
  deleteDebt,
  deleteDebtPayment,
  deleteCreditCardRepayment,
  deletePayPeriod,
  deletePaycheckPotAllocation,
  deletePot,
  deleteRecurringPayment,
  deleteTransaction,
  getPlannerSnapshot,
  resetPlannerData,
  skipDebtReserve,
  toggleRecurringPayment,
  updatePlannerDataToLatest,
  updateCreditCard,
  updateCreditCardPot,
  updateCreditCardRepayment,
  updateDebt,
  updateDebtReserve,
  updateCustomPayment,
  upsertPaycheckPotAllocation,
  updatePot,
  updateRecurringPayment,
  updateSettings,
  updateTransaction,
  type CreditCardInput,
  type CreditCardPotApplyInput,
  type CreditCardPotInput,
  type CreditCardPotUpdateInput,
  type CreditCardRepaymentUpdateInput,
  type CreditCardUpdateInput,
  type CreditCardRepaymentInput,
  type CustomPaymentInput,
  type CustomPaymentUpdateInput,
  type DailyBriefInput,
  type DebtInput,
  type DebtPaymentInput,
  type DebtReserveApplyInput,
  type DebtReserveInput,
  type DebtReserveSkipInput,
  type DebtReserveUpdateInput,
  type DebtUpdateInput,
  type PaycheckPlanInput,
  type PaycheckPotAllocationInput,
  type PlannerSnapshot,
  type PotInput,
  type PotUpdateInput,
  type RecurringPaymentInput,
  type RecurringPaymentUpdateInput,
  type TransactionInput,
  type TransactionUpdateInput,
} from '../storage/repository'
import type { RecurringPayment } from '../types/models'

export interface PlannerActions {
  refresh: () => Promise<void>
  updateSettings: typeof updateSettings
  addPot: typeof addPot
  updatePot: typeof updatePot
  deletePot: typeof deletePot
  addCreditCard: typeof addCreditCard
  updateCreditCard: typeof updateCreditCard
  archiveCreditCard: typeof archiveCreditCard
  addCreditCardPot: typeof addCreditCardPot
  updateCreditCardPot: typeof updateCreditCardPot
  deleteCreditCardPot: typeof deleteCreditCardPot
  applyCreditCardPot: typeof applyCreditCardPot
  addCustomPayment: typeof addCustomPayment
  updateCustomPayment: typeof updateCustomPayment
  deleteCustomPayment: typeof deleteCustomPayment
  addCreditCardRepayment: typeof addCreditCardRepayment
  updateCreditCardRepayment: typeof updateCreditCardRepayment
  deleteCreditCardRepayment: typeof deleteCreditCardRepayment
  addDailyBrief: typeof addDailyBrief
  addRecurringPayment: typeof addRecurringPayment
  updateRecurringPayment: typeof updateRecurringPayment
  toggleRecurringPayment: typeof toggleRecurringPayment
  deleteRecurringPayment: typeof deleteRecurringPayment
  addTransaction: typeof addTransaction
  updateTransaction: typeof updateTransaction
  deleteTransaction: typeof deleteTransaction
  addDebt: typeof addDebt
  updateDebt: typeof updateDebt
  deleteDebt: typeof deleteDebt
  addDebtPayment: typeof addDebtPayment
  deleteDebtPayment: typeof deleteDebtPayment
  addDebtReserve: typeof addDebtReserve
  updateDebtReserve: typeof updateDebtReserve
  cancelDebtReserve: typeof cancelDebtReserve
  skipDebtReserve: typeof skipDebtReserve
  applyDebtReserve: typeof applyDebtReserve
  createPaycheckPlan: typeof createPaycheckPlan
  upsertPaycheckPotAllocation: typeof upsertPaycheckPotAllocation
  deletePaycheckPotAllocation: typeof deletePaycheckPotAllocation
  deletePayPeriod: typeof deletePayPeriod
  resetPlannerData: typeof resetPlannerData
  updatePlannerDataToLatest: typeof updatePlannerDataToLatest
}

export function usePlannerData() {
  const [snapshot, setSnapshot] = useState<PlannerSnapshot | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    const nextSnapshot = await getPlannerSnapshot()
    setSnapshot(nextSnapshot)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      refresh().catch((caughtError: unknown) => {
        setError(caughtError instanceof Error ? caughtError.message : 'Unable to load planner data')
        setIsLoading(false)
      })
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [refresh])

  const actions = useMemo<PlannerActions>(
    () => ({
      refresh,
      updateSettings: withRefresh(updateSettings, refresh),
      addPot: withRefresh(addPot, refresh),
      updatePot: withRefresh(updatePot, refresh),
      deletePot: withRefresh(deletePot, refresh),
      addCreditCard: withRefresh(addCreditCard, refresh),
      updateCreditCard: withRefresh(updateCreditCard, refresh),
      archiveCreditCard: withRefresh(archiveCreditCard, refresh),
      addCreditCardPot: withRefresh(addCreditCardPot, refresh),
      updateCreditCardPot: withRefresh(updateCreditCardPot, refresh),
      deleteCreditCardPot: withRefresh(deleteCreditCardPot, refresh),
      applyCreditCardPot: withRefresh(applyCreditCardPot, refresh),
      addCustomPayment: withRefresh(addCustomPayment, refresh),
      updateCustomPayment: withRefresh(updateCustomPayment, refresh),
      deleteCustomPayment: withRefresh(deleteCustomPayment, refresh),
      addCreditCardRepayment: withRefresh(addCreditCardRepayment, refresh),
      updateCreditCardRepayment: withRefresh(updateCreditCardRepayment, refresh),
      deleteCreditCardRepayment: withRefresh(deleteCreditCardRepayment, refresh),
      addDailyBrief: withRefresh(addDailyBrief, refresh),
      addRecurringPayment: withRefresh(addRecurringPayment, refresh),
      updateRecurringPayment: withRefresh(updateRecurringPayment, refresh),
      toggleRecurringPayment: withRefresh(toggleRecurringPayment, refresh),
      deleteRecurringPayment: withRefresh(deleteRecurringPayment, refresh),
      addTransaction: withRefresh(addTransaction, refresh),
      updateTransaction: withRefresh(updateTransaction, refresh),
      deleteTransaction: withRefresh(deleteTransaction, refresh),
      addDebt: withRefresh(addDebt, refresh),
      updateDebt: withRefresh(updateDebt, refresh),
      deleteDebt: withRefresh(deleteDebt, refresh),
      addDebtPayment: withRefresh(addDebtPayment, refresh),
      deleteDebtPayment: withRefresh(deleteDebtPayment, refresh),
      addDebtReserve: withRefresh(addDebtReserve, refresh),
      updateDebtReserve: withRefresh(updateDebtReserve, refresh),
      cancelDebtReserve: withRefresh(cancelDebtReserve, refresh),
      skipDebtReserve: withRefresh(skipDebtReserve, refresh),
      applyDebtReserve: withRefresh(applyDebtReserve, refresh),
      createPaycheckPlan: withRefresh(createPaycheckPlan, refresh),
      upsertPaycheckPotAllocation: withRefresh(upsertPaycheckPotAllocation, refresh),
      deletePaycheckPotAllocation: withRefresh(deletePaycheckPotAllocation, refresh),
      deletePayPeriod: withRefresh(deletePayPeriod, refresh),
      resetPlannerData: withRefresh(resetPlannerData, refresh),
      updatePlannerDataToLatest: withRefresh(updatePlannerDataToLatest, refresh),
    }),
    [refresh],
  )

  return {
    snapshot,
    isLoading,
    error,
    actions,
  }
}

function withRefresh<Args extends unknown[]>(
  action: (...args: Args) => Promise<void>,
  refresh: () => Promise<void>,
) {
  return async (...args: Args) => {
    await action(...args)
    await refresh()
  }
}

export type {
  CreditCardInput,
  CreditCardPotApplyInput,
  CreditCardPotInput,
  CreditCardPotUpdateInput,
  CreditCardRepaymentInput,
  CreditCardRepaymentUpdateInput,
  CreditCardUpdateInput,
  CustomPaymentInput,
  CustomPaymentUpdateInput,
  DailyBriefInput,
  DebtInput,
  DebtPaymentInput,
  DebtReserveApplyInput,
  DebtReserveInput,
  DebtReserveSkipInput,
  DebtReserveUpdateInput,
  DebtUpdateInput,
  PaycheckPlanInput,
  PaycheckPotAllocationInput,
  PlannerSnapshot,
  PotInput,
  PotUpdateInput,
  RecurringPayment,
  RecurringPaymentInput,
  RecurringPaymentUpdateInput,
  TransactionInput,
  TransactionUpdateInput,
}

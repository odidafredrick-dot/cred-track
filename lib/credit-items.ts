export type CreditItemLike = {
  id?: string;
  name: string;
  quantity: number | string | null;
  unitPrice: number | string | null;
  total?: number | string | null;
};

export type UnpaidCreditItemRow<TItem extends CreditItemLike = CreditItemLike> =
  Omit<TItem, "quantity" | "unitPrice" | "total"> & {
    creditId: string;
    dueDate?: string;
    quantity: number;
    originalQuantity: number;
    unitPrice: number;
    total: number;
    originalTotal: number;
    paidAmount: number;
  };

function asMoney(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return 0;
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function totalItemQuantity(items: Array<{ quantity: number }>) {
  return items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
}

export function getUnpaidItemRowsForCredit<TItem extends CreditItemLike>(credit: {
  id: string;
  dueDate?: string;
  amountPaid?: number | string | null;
  items?: TItem[];
}) {
  let unappliedPaidAmount = Math.max(0, asMoney(credit.amountPaid));

  return (credit.items || []).flatMap((item) => {
    const originalQuantity = Math.max(0, Math.floor(Number(item.quantity || 0)));
    const unitPrice = Math.max(0, asMoney(item.unitPrice));
    const calculatedTotal = asMoney(originalQuantity * unitPrice);
    const originalTotal = Math.max(0, asMoney(item.total ?? calculatedTotal));

    if (originalQuantity <= 0 || originalTotal <= 0) {
      return [];
    }

    const paidAmount = Math.min(unappliedPaidAmount, originalTotal);
    unappliedPaidAmount = Math.max(0, asMoney(unappliedPaidAmount - paidAmount));

    const total = Math.max(0, asMoney(originalTotal - paidAmount));
    if (total <= 0) {
      return [];
    }

    const paidUnits = unitPrice > 0 ? Math.floor(paidAmount / unitPrice) : 0;
    const quantity = Math.max(0, originalQuantity - paidUnits);

    if (quantity <= 0) {
      return [];
    }

    return [
      {
        ...item,
        creditId: credit.id,
        dueDate: credit.dueDate,
        quantity,
        originalQuantity,
        unitPrice,
        total,
        originalTotal,
        paidAmount,
      } satisfies UnpaidCreditItemRow<TItem>,
    ];
  });
}

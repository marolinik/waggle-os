/**
 * Neutral Phase-A artifact set for the retail conforming pilot (Mode-1, 03 C3).
 *
 * Generic, re-derivable retail PROCEDURES (M1) and POLICY FACTS (M2) drawn from
 * the τ² retail tool surface + domain policy — NOT task-specific answers. The
 * set is hand-authored by a neutral builder and committed verbatim so the frozen
 * mind is model-neutral BY CONSTRUCTION (byte-identical across the qwen/opus
 * arms ⇒ the model is the only variable, 02 §4.1 Mode-1).
 *
 * Firewall: none of these contains a Phase-A/B gold action sequence — golds are
 * serialized as `tool(<json args>) ; …`, which never appears here (we name tools
 * but never their argumented call form). `buildAndFreezeMind` asserts no gold
 * substring at build time, so a violation fails the build loudly.
 */

import { type PhaseAArtifact } from './mind-build.js';

export const RETAIL_PHASE_A_ARTIFACTS: readonly PhaseAArtifact[] = [
  // ── M1 — procedures ──
  {
    task_id: 'm1-identity', mechanism: 'M1', procedure_family: 'identity', recurring_user: null,
    content:
      'Before reading or changing any order, verify the customer: collect their full name and zip code and use find_user_id_by_name_zip to resolve the user_id. Never act on an order without a confirmed user_id.',
  },
  {
    task_id: 'm1-exchange', mechanism: 'M1', procedure_family: 'exchange', recurring_user: null,
    content:
      'To exchange a delivered item: resolve the user, read the order with get_order_details, use get_product_details to find the target variant item_id, then use exchange_delivered_order_items with the order id, the item being returned, and the new variant. Exchanges apply to delivered orders only.',
  },
  {
    task_id: 'm1-return', mechanism: 'M1', procedure_family: 'return', recurring_user: null,
    content:
      'To return a delivered item: resolve the user, read the order with get_order_details, confirm the item is eligible, then use return_delivered_order_items with the order id and the items to return. Returns apply to delivered orders.',
  },
  {
    task_id: 'm1-cancel', mechanism: 'M1', procedure_family: 'cancel', recurring_user: null,
    content:
      'To cancel an order: read it with get_order_details and confirm it is still pending, then use cancel_pending_order with the order id and a reason. Only pending orders can be cancelled; shipped or delivered orders must be returned or exchanged instead.',
  },
  {
    task_id: 'm1-modify-items', mechanism: 'M1', procedure_family: 'modify', recurring_user: null,
    content:
      'To change items on a not-yet-shipped order: confirm it is pending, use get_product_details to find the new variant item_id, then use modify_pending_order_items with the order id, the old item, and the new item. Item changes require a pending order.',
  },
  {
    task_id: 'm1-modify-address-payment', mechanism: 'M1', procedure_family: 'modify', recurring_user: null,
    content:
      'To change the shipping address or payment on a pending order, use modify_pending_order_address or modify_pending_order_payment with the order id and the new details. These only work while the order is pending.',
  },
  {
    task_id: 'm1-catalog', mechanism: 'M1', procedure_family: 'catalog', recurring_user: null,
    content:
      'A product has multiple variants that share one product but differ by item (e.g. colour, size, switch type). Always use get_product_details to list a product’s variants, their items, prices, and availability before selecting one for an exchange or modification.',
  },
  // ── M2 — policy facts ──
  {
    task_id: 'm2-ownership', mechanism: 'M2', procedure_family: 'return', recurring_user: null,
    content:
      'Retail policy: an agent may only read or modify an order that belongs to the authenticated user. Confirm the order is on the resolved user’s account before any return, exchange, cancellation, or modification.',
  },
  {
    task_id: 'm2-pending-only', mechanism: 'M2', procedure_family: 'cancel', recurring_user: null,
    content:
      'Retail policy: only orders in the pending state can be cancelled or have their items, address, or payment changed. Once an order is shipped or delivered it can no longer be cancelled or modified — offer a return or exchange instead.',
  },
  {
    task_id: 'm2-refund-target', mechanism: 'M2', procedure_family: 'modify', recurring_user: null,
    content:
      'Retail policy: refunds from a return or exchange go to the original payment method or, at the customer’s choice, to gift-card credit; a pending order’s payment method may be changed at most once. Confirm the customer’s intended refund or payment target before acting.',
  },
];

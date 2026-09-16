"""
SmartPharm - Distributor Intelligence Package
Includes invoice parsing, catalog matching, purchase draft generation,
and physical delivery verification.
"""

from app.distributor.invoice_parser import (
    ParsedInvoice,
    ParsedInvoiceItem,
    DistributorInvoiceParser,
    default_invoice_parser,
)
from app.distributor.invoice_matcher import (
    MatchedInvoiceItem,
    MatchedInvoiceDraft,
    InvoiceCatalogMatcher,
    default_catalog_matcher,
)
from app.distributor.delivery_verifier import (
    ExpectedItem,
    ActualScannedItem,
    DeliveryLineDiscrepancy,
    DeliveryDiscrepancyReport,
    DiscrepancyType,
    DeliveryVerifier,
    default_delivery_verifier,
)

__all__ = [
    "ParsedInvoice",
    "ParsedInvoiceItem",
    "DistributorInvoiceParser",
    "default_invoice_parser",
    "MatchedInvoiceItem",
    "MatchedInvoiceDraft",
    "InvoiceCatalogMatcher",
    "default_catalog_matcher",
    "ExpectedItem",
    "ActualScannedItem",
    "DeliveryLineDiscrepancy",
    "DeliveryDiscrepancyReport",
    "DiscrepancyType",
    "DeliveryVerifier",
    "default_delivery_verifier",
]

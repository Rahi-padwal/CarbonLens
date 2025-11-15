"""
Utility helpers for working with stored OAuth token documents.
"""

from typing import Optional, Tuple

from utils.firebase_config import get_collection


def resolve_google_token_document(identifier: Optional[str]) -> Tuple[Optional[object], Optional[object]]:
    """
    Locate the Google OAuth token document by user identifier.

    The identifier can be either the Google user ID (document ID) or the
    user's email address. Returns a tuple of (document_snapshot, document_ref);
    either entry may be None when no match is found.
    """
    if not identifier:
        return None, None

    identifier = identifier.strip()
    if not identifier:
        return None, None

    tokens_collection = get_collection('oauth_tokens')

    if '@' in identifier:
        candidates = []
        lowered = identifier.lower()
        candidates.append(identifier)
        if lowered != identifier:
            candidates.append(lowered)

        for candidate in candidates:
            candidate = candidate.strip()
            if not candidate:
                continue
            query = tokens_collection.where('user_email', '==', candidate).limit(1).stream()
            for doc in query:
                doc_ref = tokens_collection.document(doc.id)
                return doc, doc_ref
        return None, None

    doc_ref = tokens_collection.document(identifier)
    doc_snapshot = doc_ref.get()
    if not doc_snapshot.exists:
        return None, None
    return doc_snapshot, doc_ref



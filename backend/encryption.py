from cryptography.fernet import Fernet

from config import settings


def _get_fernet() -> Fernet:
    key = settings.encryption_key
    if not key:
        raise ValueError(
            "ENCRYPTION_KEY is not set. Generate one with: "
            "python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
        )
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_password(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt_password(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()

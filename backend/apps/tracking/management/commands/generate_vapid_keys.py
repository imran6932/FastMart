import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


def base64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Command(BaseCommand):
    help = "Generate VAPID public and private keys for web push notifications"

    def handle(self, *args, **options):
        private_key = ec.generate_private_key(ec.SECP256R1())

        private_bytes = private_key.private_numbers().private_value.to_bytes(32, "big")
        public_bytes = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )

        self.stdout.write(f"VAPID_PUBLIC_KEY = {base64url(public_bytes)}")
        self.stdout.write(f"VAPID_PRIVATE_KEY = {base64url(private_bytes)}")
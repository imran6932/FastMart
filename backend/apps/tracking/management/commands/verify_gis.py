import base64

from django.core.management.base import BaseCommand
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import serialization


def base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


class Command(BaseCommand):
    help = "Generate VAPID public/private keys"

    def handle(self, *args, **options):
        private_key = ec.generate_private_key(ec.SECP256R1())

        private_bytes = private_key.private_numbers().private_value.to_bytes(32, "big")

        public_bytes = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )

        self.stdout.write(self.style.SUCCESS("VAPID keys generated successfully.\n"))

        self.stdout.write("VAPID_PUBLIC_KEY=")
        self.stdout.write(base64url(public_bytes))

        self.stdout.write("\nVAPID_PRIVATE_KEY=")
        self.stdout.write(base64url(private_bytes))

        self.stdout.write("\nVAPID_CLAIMS_SUB=mailto:your-email@example.com")
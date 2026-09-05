"""
Tracking serializers.

PushSubscriptionSerializer — register/update a Web Push subscription.
"""

from rest_framework import serializers

from apps.accounts.models import PushSubscription


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ['id', 'endpoint', 'p256dh_key', 'auth_key', 'created_at']
        read_only_fields = ['id', 'created_at']

    def create(self, validated_data):
        # Upsert: if the endpoint already exists for this user, update keys.
        # This handles browser key rotation after a push subscription renewal.
        sub, _ = PushSubscription.objects.update_or_create(
            user=self.context['request'].user,
            endpoint=validated_data['endpoint'],
            defaults={
                'p256dh_key': validated_data['p256dh_key'],
                'auth_key': validated_data['auth_key'],
            },
        )
        return sub

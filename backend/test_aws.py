import boto3
from config import settings

try:
    client = boto3.client(
        'sts',
        region_name=settings.AWS_REGION,
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
    )
    res = client.get_caller_identity()
    print("SUCCESS: ", res['Arn'])
except Exception as e:
    print("ERROR: ", str(e))

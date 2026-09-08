# Provider Gateway Contract

Every provider adapter should implement:
- createJob(request)
- getJobStatus(providerJobId)
- cancelJob(providerJobId)
- mapProviderError(error)
- estimateCost(request)

The gateway must never expose provider credentials to Android.

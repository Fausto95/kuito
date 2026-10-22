// Include device and OS details in a user-visible support summary.
import { Text, device } from 'kuito';

export function SupportDetails() {
  return (
    <Text>
      {JSON.stringify(
        {
          os: device.osName,
          version: device.osVersion,
          build: device.osBuildId,
          model: device.model,
          modelId: device.modelId,
          brand: device.brand,
          manufacturer: device.manufacturer,
          physical: device.physical,
          type: device.type,
          apiLevel: device.apiLevel,
          memory: device.memory,
        },
        null,
        2,
      )}
    </Text>
  );
}

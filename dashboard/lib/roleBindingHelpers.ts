import { prisma } from "./prisma";

export async function getRoleIdForPermission(permissionKey: string): Promise<string | null> {
  const binding = await prisma.roleBinding.findFirst({ where: { permissionKey } });
  return binding?.discordRoleId ?? null;
}

// U6: balance + reward list + redeem flow.
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Reward } from "@hush/shared-types";
import { getWalletBalance, listRewards, redeemReward } from "../lib/wallet";
import { colors, fonts } from "../lib/theme";

export function WalletScreen() {
  const [balance, setBalance] = useState<number | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redeemingId, setRedeemingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getWalletBalance(), listRewards()])
      .then(([balanceValue, rewardList]) => {
        setBalance(balanceValue);
        setRewards(rewardList);
      })
      .catch((err: Error) => setErrorMessage(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleRedeem(reward: Reward) {
    setRedeemingId(reward.id);
    setErrorMessage(null);
    setConfirmation(null);
    try {
      await redeemReward(reward.id);
      const freshBalance = await getWalletBalance();
      setBalance(freshBalance);
      setConfirmation(`Redeemed: ${reward.name}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Redemption failed.");
    } finally {
      setRedeemingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.glowHigh} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.balanceLabel}>YOUR BALANCE</Text>
      <Text style={styles.balanceValue}>{balance ?? 0}</Text>
      {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      {confirmation && <Text style={styles.confirmationText}>{confirmation}</Text>}
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {rewards.map((reward) => {
          const affordable = (balance ?? 0) >= reward.pointsCost;
          return (
            <View key={reward.id} style={styles.rewardRow}>
              <View style={styles.rewardInfo}>
                <Text style={styles.rewardName}>{reward.name}</Text>
                <Text style={styles.rewardCost}>{reward.pointsCost} points</Text>
              </View>
              <Pressable
                style={[styles.redeemButton, !affordable && styles.redeemButtonDisabled]}
                disabled={!affordable || redeemingId === reward.id}
                onPress={() => handleRedeem(reward)}
              >
                <Text style={styles.redeemButtonText}>
                  {redeemingId === reward.id ? "Redeeming…" : "Redeem"}
                </Text>
              </Pressable>
            </View>
          );
        })}
        {rewards.length === 0 && <Text style={styles.emptyText}>No rewards available yet.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, paddingTop: 56 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" },
  balanceLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 2, color: colors.muted, textAlign: "center" },
  balanceValue: { fontFamily: fonts.hero, fontSize: 48, color: colors.rewardGold, textAlign: "center", marginBottom: 24 },
  errorText: { fontFamily: fonts.body, color: colors.alert, textAlign: "center", marginBottom: 12 },
  confirmationText: { fontFamily: fonts.body, color: colors.ink, textAlign: "center", marginBottom: 12 },
  list: { flex: 1 },
  listContent: { gap: 10 },
  rewardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
  },
  rewardInfo: { flex: 1 },
  rewardName: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.ink },
  rewardCost: { fontFamily: fonts.body, fontSize: 12, color: colors.nightMutedText, marginTop: 2 },
  redeemButton: { backgroundColor: colors.glowHigh, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  redeemButtonDisabled: { backgroundColor: colors.border },
  redeemButtonText: { fontFamily: fonts.bodySemiBold, color: colors.night, fontSize: 12 },
  emptyText: { fontFamily: fonts.body, color: colors.muted, textAlign: "center", marginTop: 40 },
});

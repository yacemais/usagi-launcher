package smp.usagi.social;

import java.nio.file.Files;
import net.minecraft.gametest.framework.GameTest;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraftforge.gametest.GameTestHolder;
import net.minecraftforge.gametest.PrefixGameTestTemplate;

@GameTestHolder("usagisocial")
@PrefixGameTestTemplate(false)
public final class SocialGameTests {
    @GameTest(template="empty")
    public static void privateCommandsRegistered(GameTestHelper helper) {
        var root=helper.getLevel().getServer().getCommands().getDispatcher().getRoot().getChild("usagi");
        helper.assertTrue(root!=null,"Usagi root command is registered");
        for(String name:new String[]{"msg","reply","inbox","friends"})helper.assertTrue(root.getChild(name)!=null,"Missing private command: "+name);
        helper.assertTrue(!root.canUse(helper.getLevel().getServer().createCommandSourceStack()),"Console cannot impersonate a player");helper.succeed();
    }
    @GameTest(template="empty")
    public static void receiptSurvivesRestart(GameTestHelper helper) throws Exception {
        var directory=Files.createTempDirectory("usagi-receipt-test");var file=directory.resolve("receipts.json");String id=java.util.UUID.randomUUID().toString();
        var first=new Receipts(file);first.record(id);helper.assertTrue(new Receipts(file).contains(id),"Receipt must survive reopening");Files.delete(file);Files.delete(directory);helper.succeed();
    }
}

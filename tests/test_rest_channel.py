import pytest
from unittest.mock import Mock, patch
from agent.channels.base import ProtocolHandler
from agent.channels.rest import RestChannel


class TestProtocolHandler:
    def test_base_cannot_be_instantiated(self):
        with pytest.raises(TypeError):
            ProtocolHandler()


class TestRestChannel:
    @pytest.mark.asyncio
    async def test_start_stops_subprocess(self):
        channel = RestChannel(port=18999)
        with patch("subprocess.Popen") as mock_popen:
            proc = Mock()
            proc.poll.return_value = None
            mock_popen.return_value = proc

            await channel.start(None)
            assert channel.process is not None
            assert channel.running is True

            await channel.stop()
            assert channel.running is False

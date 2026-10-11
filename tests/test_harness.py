import importlib.util, unittest, tempfile, json, os
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
spec=importlib.util.spec_from_file_location('harness',Path(__file__).resolve().parents[1]/'scripts/harness-server.py')
harness=importlib.util.module_from_spec(spec);spec.loader.exec_module(harness)
client=TestClient(harness.app)
class HarnessRegression(unittest.TestCase):
 def test_missing_compose_value_does_not_prove_submission(self):
  controls=[{'id':'row','type':'DataItem','name':'Me (You)'},{'id':'header','type':'Button','name':'Me (You)'},{'id':'compose','type':'Edit','name':'','automation_id':''},{'id':'send','type':'Button','name':'Send'}]
  observation={'snapshot':'missing-compose-value','controls':controls}
  with patch.object(harness,'open_chrome',return_value={'handle':42,'tab':'self'}),patch.object(harness,'inspect_window',return_value=observation),patch.object(harness,'control',return_value={'value':'fixture'}),patch.object(harness.time,'sleep'):
   r=client.post('/whatsapp',json={'recipient':'self','text':'fixture','send':True,'request_id':'missing-value-regression'})
   self.assertEqual(r.status_code,409)
   self.assertIn('Submission could not be verified',r.json()['detail'])
 def test_recycle_plan_includes_images_only_and_consumes_once(self):
  with tempfile.TemporaryDirectory() as folder,patch.object(harness,'__file__',str(Path(folder)/'scripts'/'harness-server.py')):
   image=Path(folder)/'a.png';image.write_bytes(b'fixture');note=Path(folder)/'notes.txt';note.write_text('keep')
   plan=client.post('/images/plan',json={'path':folder,'recursive':True}).json()
   self.assertEqual(plan['image_count'],1)
   def recycle(name): Path(name).unlink();return True
   with patch.object(harness,'recycle_file',side_effect=recycle):
    result=client.post('/images/recycle',json={'plan':plan['plan'],'request_id':'recycle-regression'}).json()
   self.assertEqual(result['recycled'],1);self.assertTrue(note.exists())
   self.assertEqual(client.post('/images/recycle',json={'plan':plan['plan'],'request_id':'recycle-regression'}).json()['recycled'],1)
 def test_changed_image_blocks_recycling(self):
  with tempfile.TemporaryDirectory() as folder:
   image=Path(folder)/'b.jpg';image.write_bytes(b'before')
   plan=client.post('/images/plan',json={'path':folder}).json();image.write_bytes(b'changed')
   with patch.object(harness,'recycle_file') as recycle:
    self.assertEqual(client.post('/images/recycle',json={'plan':plan['plan'],'request_id':'changed-image'}).status_code,409);recycle.assert_not_called()
 def test_named_chat_spacing_and_filled_search_are_not_compose(self):
  observed={'snapshot':'named-test','controls':[{'id':'doc','type':'Document','name':'WhatsApp','bounds':[0,0,1000,800]}, {'id':'search','type':'Edit','name':'rushil2','value':'rushil2','bounds':[50,60,400,80]}, {'id':'row','type':'DataItem','name':'Rushil 2 Thursday','bounds':[0,150,400,210]}, {'id':'nested','type':'DataItem','name':'Rushil 2 Thursday Haa','bounds':[0,150,400,210]}, {'id':'header','type':'Button','name':'Rushil 2'}, {'id':'compose','type':'Edit','name':'','value':'','bounds':[600,750,900,780]}]}
  with patch.object(harness,'open_chrome',return_value={'handle':42,'tab':'named'}),patch.object(harness,'inspect_window',return_value=observed),patch.object(harness,'control',return_value={'value':'testing'}) as action,patch.object(harness.time,'sleep'):
   r=client.post('/whatsapp',json={'recipient':'rushil2','read':True,'request_id':'named-regression'})
   self.assertEqual(r.status_code,200);self.assertTrue(r.json()['verified']);self.assertEqual(len(action.call_args_list),1)
 def test_new_whatsapp_draft_preserves_previous_text_without_sending(self):
  observed={'snapshot':'draft-test','controls':[{'id':'row','type':'DataItem','name':'Me (You)'},{'id':'header','type':'Button','name':'Me (You)'},{'id':'compose','type':'Edit','name':'old draft','value':'old draft','automation_id':''}]}
  with tempfile.TemporaryDirectory() as folder, patch.object(harness,'open_chrome',return_value={'handle':42,'tab':'self'}),patch.object(harness,'inspect_window',return_value=observed),patch.object(harness,'control',return_value={'value':'new draft'}) as action,patch.object(harness.time,'sleep'),patch.object(harness,'__file__',str(Path(folder)/'scripts'/'harness-server.py')):
   r=client.post('/whatsapp',json={'recipient':'self','text':'new draft','send':False,'request_id':'draft-regression'})
   self.assertEqual(r.status_code,200);self.assertFalse(r.json()['submitted'])
   backups=list((Path(folder)/'.data'/'drafts').glob('*.json'))
   self.assertEqual(json.loads(backups[0].read_text())['text'],'old draft')
   self.assertEqual(len(action.call_args_list),2)
 def test_address_bar_normalization(self):
  self.assertEqual(harness.address_key('https://www.youtube.com/'),harness.address_key('youtube.com'))
 def test_real_file_count_not_model_caption(self):
  with tempfile.TemporaryDirectory() as folder:
   for name in ['a.png','b.JPG','c.webp','notes.txt']:(Path(folder)/name).write_bytes(b'fixture')
   r=client.post('/files',json={'path':folder})
   self.assertEqual(r.json()['image_count'],3)
   (Path(folder)/'sub').mkdir();(Path(folder)/'sub'/'more.png').write_bytes(b'fixture')
   self.assertEqual(client.post('/files',json={'path':folder,'recursive':True}).json()['image_count'],4)
 def test_stale_controls_cannot_receive_typing(self):
  r=client.post('/control',json={'snapshot':'expired','control':'1','action':'type','text':'wrong window'})
  self.assertEqual(r.status_code,409)
 def test_cancelled_job_cannot_launch(self):
  client.post('/cancel/regression-cancel')
  with patch.object(harness.subprocess,'Popen') as launch:
   r=client.post('/open',headers={'X-Micky-Task':'regression-cancel'},json={'path':'explorer.exe'})
   self.assertEqual(r.status_code,409);launch.assert_not_called()
 def test_spreadsheet_verified_and_existing_work_preserved(self):
  from openpyxl import load_workbook
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'research.xlsx'
   payload={'path':str(path),'headers':['Company','Source'],'rows':[['Example','=unsafe text']]}
   r=client.post('/spreadsheet',json=payload);self.assertTrue(r.json()['verified'])
   book=load_workbook(path);self.assertEqual(book.active['B2'].data_type,'s');book.close()
   self.assertEqual(client.post('/spreadsheet',json=payload).status_code,409)
 def test_explorer_requires_visible_window(self):
  with patch.object(harness.subprocess,'Popen') as launch, patch.object(harness,'wait_window',return_value=[]):
   r=client.post('/open',json={'path':'file manager'})
   self.assertEqual(r.status_code,504)
   self.assertEqual(launch.call_args.args[0][0],'explorer.exe')
 def test_explorer_success_has_window_evidence(self):
  evidence=[{'handle':123,'title':'Home','class':'CabinetWClass'}]
  with patch.object(harness.subprocess,'Popen'),patch.object(harness,'wait_window',return_value=evidence):
   r=client.post('/open',json={'path':'explorer.exe'})
   self.assertEqual(r.status_code,200);self.assertTrue(r.json()['visible']);self.assertEqual(r.json()['windows'],evidence)
 def test_unknown_profile_does_not_fall_back(self):
  with tempfile.TemporaryDirectory() as temp:
   state=Path(temp)/'Local State';state.write_text(json.dumps({'profile':{'info_cache':{'Default':{'user_name':'known@example.com'}}}}))
   with patch.object(harness.os.path,'expandvars',return_value=str(state)):
    r=client.post('/chrome',json={'email':'missing@example.com'})
    self.assertEqual(r.status_code,404)
 def test_launch_errors_are_reported(self):
  with patch.object(harness.os,'startfile',side_effect=OSError('File not found')):
   r=client.post('/open',json={'path':'missing.exe'})
   self.assertEqual(r.status_code,400)
 def test_empty_request_rejected(self):
  self.assertEqual(client.post('/open',json={'path':''}).status_code,400)
 def test_unicode_typing_uses_windows_clipboard(self):
  with patch.object(harness.win32clipboard,'OpenClipboard'),patch.object(harness.win32clipboard,'CloseClipboard'),patch.object(harness.win32clipboard,'EmptyClipboard'),patch.object(harness.win32clipboard,'SetClipboardText') as copy,patch.object(harness.pyautogui,'hotkey'):
   r=client.post('/type',json={'text':'नमस्ते 👋'})
   self.assertEqual(r.status_code,200);self.assertEqual(copy.call_args.args[0],'नमस्ते 👋')
if __name__=='__main__':unittest.main()

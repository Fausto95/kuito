__kuito.patch('counter', function (api) {
  var count = api.state('count', 100);

  api.render(
    __kuitoJSX('Button', {
      id: 'counter',
      text: 'broken',
      onPress: function () {
        count.value += 100;
      },
    }),
  );

  throw new Error('BROKEN_PATCH');
});
